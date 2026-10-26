import { prisma } from "@linkwarden/prisma";
import { Prisma } from "@linkwarden/prisma/client";
import getPermission from "@/lib/api/getPermission";
import { removeFolder } from "@linkwarden/filesystem";
import { meiliClient } from "@linkwarden/lib/meilisearchClient";

async function clearCollectionOrders(
  tx: Prisma.TransactionClient,
  collectionIds: number[]
) {
  const ids = Prisma.join(collectionIds);
  await tx.$executeRaw`
    UPDATE "User"
    SET "collectionOrder" = ARRAY(
      SELECT item FROM unnest("collectionOrder") AS item
      WHERE item <> ALL(ARRAY[${ids}]::integer[])
    )
    WHERE "collectionOrder" && ARRAY[${ids}]::integer[]
  `;
}

export default async function deleteCollection(
  userId: number,
  collectionId: number
) {
  if (!collectionId)
    return { response: "Please choose a valid collection.", status: 401 };
  const collection = await getPermission({ userId, collectionId });
  if (!collection)
    return { response: "Collection is not accessible.", status: 401 };

  const deleting =
    collection.ownerId === userId ||
    (!!collection.parentId && collection.effectivePermission.canDelete);
  if (!deleting) {
    const direct = await prisma.usersAndCollections.findUnique({
      where: { userId_collectionId: { userId, collectionId } },
    });
    if (!direct)
      return {
        response:
          "This collection is assigned by a group or the company. Contact its manager.",
        status: 403,
      };
    const relation = await prisma.$transaction(async (tx) => {
      const removed = await tx.usersAndCollections.delete({
        where: { userId_collectionId: { userId, collectionId } },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { collectionOrder: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          collectionOrder: user.collectionOrder.filter(
            (id) => id !== collectionId
          ),
        },
      });
      await tx.dashboardSection.deleteMany({ where: { userId, collectionId } });
      return removed;
    });
    return { response: relation, status: 200 };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const subtree = await tx.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "Collection" WHERE id = ${collectionId}
        UNION
        SELECT child.id FROM "Collection" child
        JOIN subtree parent ON child."parentId" = parent.id
      )
      SELECT id FROM subtree
    `;
    const collectionIds = subtree.map((row) => row.id);
    const links = await tx.link.findMany({
      where: { collectionId: { in: collectionIds } },
      select: { id: true },
    });
    // PostgreSQL cascades the entire subtree and its links in this transaction.
    // No filesystem or search changes happen before a successful commit.
    const result = await tx.collection.delete({ where: { id: collectionId } });
    await clearCollectionOrders(tx, collectionIds);
    return { result, collectionIds, linkIds: links.map((link) => link.id) };
  });

  const cleanup = await Promise.allSettled([
    ...(meiliClient && deleted.linkIds.length
      ? [meiliClient.index("links").deleteDocuments(deleted.linkIds)]
      : []),
    ...deleted.collectionIds.flatMap((id) => [
      removeFolder({ filePath: `archives/${id}` }),
      removeFolder({ filePath: `archives/preview/${id}` }),
    ]),
  ]);
  if (cleanup.some((result) => result.status === "rejected"))
    console.error(
      "Collection deleted; archive or search cleanup requires retry.",
      {
        collectionIds: deleted.collectionIds,
      }
    );
  return { response: deleted.result, status: 200 };
}
