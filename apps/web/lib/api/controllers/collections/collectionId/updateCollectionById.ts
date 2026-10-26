import { prisma } from "@linkwarden/prisma";
import getPermission from "@/lib/api/getPermission";
import getCollectionById from "./getCollectionById";
import {
  UpdateCollectionSchema,
  UpdateCollectionSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateCollection(
  userId: number,
  collectionId: number,
  body: UpdateCollectionSchemaType
) {
  const parsed = UpdateCollectionSchema.safeParse(body);
  if (!parsed.success)
    return { response: parsed.error.issues[0].message, status: 400 };
  const data = parsed.data;
  const collection = await getPermission({ userId, collectionId });
  if (!collection?.effectivePermission.canUpdate)
    return { response: "Collection is not accessible.", status: 403 };
  const existing = await prisma.usersAndCollections.findMany({
    where: { collectionId },
  });
  const members = Array.from(
    new Map(
      data.members
        .filter((m) => m.userId !== collection.ownerId)
        .map((m) => [
          m.userId,
          {
            userId: m.userId,
            canCreate: m.canCreate,
            canUpdate: m.canUpdate,
            canDelete: m.canDelete,
            canManage:
              m.canManage ??
              existing.find((e) => e.userId === m.userId)?.canManage ??
              false,
          },
        ])
    ).values()
  );
  const normalize = (rows: typeof members) =>
    JSON.stringify(
      rows
        .map((m) => ({
          userId: m.userId,
          canCreate: m.canCreate,
          canUpdate: m.canUpdate,
          canDelete: m.canDelete,
          canManage: m.canManage,
        }))
        .sort((a, b) => a.userId - b.userId)
    );
  const grantsChanged = normalize(members) !== normalize(existing);
  const publicChanged =
    data.isPublic !== undefined && data.isPublic !== collection.isPublic;
  const nextParent =
    data.parentId === "root" ? null : data.parentId ?? collection.parentId;
  const moving = nextParent !== collection.parentId;
  if (
    (grantsChanged ||
      publicChanged ||
      moving ||
      data.propagateToSubcollections) &&
    !collection.effectivePermission.canManage
  )
    return {
      response: "Collection management permission required.",
      status: 403,
    };
  if (moving && nextParent) {
    const target = await getPermission({ userId, collectionId: nextParent });
    if (
      !target?.effectivePermission.canManage ||
      target.ownerId !== collection.ownerId
    )
      return {
        response:
          "The source and target require management permission and the same owner.",
        status: 403,
      };
    const seen = new Set([collectionId]);
    let current: number | null = nextParent;
    while (current) {
      if (seen.has(current))
        return {
          response: "A collection cannot be moved inside itself.",
          status: 400,
        };
      seen.add(current);
      current =
        (
          await prisma.collection.findUnique({
            where: { id: current },
            select: { parentId: true },
          })
        )?.parentId ?? null;
    }
  }
  // Root classifications belong at the root; prevent moving company visibility under a private tree.
  if (moving && collection.scope !== "PERSONAL")
    return {
      response: "Change this root collection to personal before moving it.",
      status: 400,
    };
  await prisma.$transaction(async (tx) => {
    if (data.propagateToSubcollections) {
      // Replace old copied direct grants with dynamic inheritance from this collection.
      const descendants: number[] = [];
      const visited = new Set([collectionId]);
      let frontier = [collectionId];
      while (frontier.length) {
        const children = await tx.collection.findMany({
          where: { parentId: { in: frontier } },
          select: { id: true },
        });
        frontier = children.map((c) => c.id).filter((id) => !visited.has(id));
        frontier.forEach((id) => {
          visited.add(id);
          descendants.push(id);
        });
      }
      await tx.usersAndCollections.deleteMany({
        where: { collectionId: { in: descendants } },
      });
    }
    if (grantsChanged) {
      await tx.usersAndCollections.deleteMany({ where: { collectionId } });
      await tx.usersAndCollections.createMany({
        data: members.map((m) => ({ ...m, collectionId })),
      });
    }
    await tx.collection.update({
      where: { id: collectionId },
      data: {
        name: data.name.trim(),
        description: data.description,
        color: data.color,
        icon: data.icon,
        iconWeight: data.iconWeight,
        isPublic: data.isPublic,
        parentId: nextParent,
      },
    });
    await tx.link.updateMany({
      where: { collectionId },
      data: { indexVersion: null },
    });
  });
  return getCollectionById(userId, collectionId);
}
