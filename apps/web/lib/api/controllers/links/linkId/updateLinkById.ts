import { prisma } from "@linkwarden/prisma";
import { Prisma } from "@linkwarden/prisma/client";
import getPermission from "@/lib/api/getPermission";
import { moveFiles, removeFiles } from "@linkwarden/filesystem";
import isValidUrl from "@/lib/shared/isValidUrl";
import {
  UpdateLinkSchema,
  UpdateLinkSchemaType,
} from "@linkwarden/lib/schemaValidation";

export default async function updateLinkById(
  userId: number,
  linkId: number,
  body: UpdateLinkSchemaType,
  removePreviousTags?: boolean
) {
  const parsed = UpdateLinkSchema.safeParse(body);
  if (!parsed.success)
    return { response: parsed.error.issues[0].message, status: 400 };
  const data = parsed.data;
  const source = await getPermission({ userId, linkId });
  if (!source)
    return { response: "Collection is not accessible.", status: 403 };
  const include = {
    tags: true,
    collection: true,
    pinnedBy: { where: { id: userId }, select: { id: true } },
  };
  // Pinning changes only the caller's dashboard; it never updates shared content.
  if (data.pinOnly) {
    const link = await prisma.link.update({
      where: { id: linkId },
      data: {
        pinnedBy:
          data.pinnedBy?.[0]?.id === userId
            ? { connect: { id: userId } }
            : { disconnect: { id: userId } },
      },
      include,
    });
    return { response: link, status: 200 };
  }
  if (!source.effectivePermission.canUpdate)
    return { response: "Collection is not accessible.", status: 403 };
  const moving = source.id !== data.collection.id;
  const target = moving
    ? await getPermission({ userId, collectionId: data.collection.id })
    : source;
  if (
    !target ||
    (moving &&
      (!source.effectivePermission.canDelete ||
        !target.effectivePermission.canCreate))
  )
    return {
      response:
        "Moving a link requires delete access to the source and create access to the target.",
      status: 403,
    };
  if (source.effectivePermission.shared && data.version === undefined)
    return {
      response:
        "Reload this link before editing; a version is required for shared content.",
      status: 409,
    };
  const oldLink = await prisma.link.findUnique({ where: { id: linkId } });
  if (!oldLink) return { response: "Link not found.", status: 404 };
  if (data.version !== undefined && oldLink.version !== data.version)
    return {
      response:
        "This link was changed by another user. Reload it before saving.",
      status: 409,
    };
  const nextUrl = data.url === undefined ? oldLink.url : data.url;
  const urlChanged = nextUrl !== oldLink.url;
  if (urlChanged && (!nextUrl || !isValidUrl(nextUrl)))
    return { response: "Invalid URL.", status: 400 };
  const tags = Array.from(
    new Map(
      data.tags
        .filter((t) => t.name.trim())
        .map((tag) => [tag.name.trim(), tag])
    ).values()
  );
  const connectOrCreate = tags.map((tag) => ({
    where: { name_ownerId: { name: tag.name.trim(), ownerId: target.ownerId } },
    create: {
      name: tag.name.trim(),
      owner: { connect: { id: target.ownerId } },
    },
  }));
  let updated;
  try {
    // Compare and increment in the same SQL update; two writers cannot both win.
    updated = await prisma.link.update({
      where: { id: linkId, version: data.version ?? oldLink.version },
      data: {
        version: { increment: 1 },
        name: data.name ?? "",
        url: nextUrl,
        description: data.description ?? "",
        icon: data.icon,
        iconWeight: data.iconWeight,
        color: data.color,
        ...(urlChanged
          ? {
              image: null,
              pdf: null,
              readable: null,
              monolith: null,
              preview: null,
              lastPreserved: null,
            }
          : {}),
        indexVersion: null,
        collection: { connect: { id: target.id } },
        tags: removePreviousTags
          ? { set: [], connectOrCreate }
          : { connectOrCreate },
      },
      include,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return {
        response:
          "This link was changed by another user. Reload it before saving.",
        status: 409,
      };
    throw error;
  }
  if (urlChanged) await removeFiles(linkId, source.id);
  else if (moving) await moveFiles(linkId, source.id, target.id);
  return { response: updated, status: 200 };
}
