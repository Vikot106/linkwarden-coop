import { prisma } from "@linkwarden/prisma";
import { createFolder } from "@linkwarden/filesystem";
import {
  PostCollectionSchema,
  PostCollectionSchemaType,
} from "@linkwarden/lib/schemaValidation";
import getPermission from "@/lib/api/getPermission";
import getCollectionById from "./collectionId/getCollectionById";

export default async function postCollection(
  body: PostCollectionSchemaType,
  userId: number
) {
  const parsed = PostCollectionSchema.safeParse(body);
  if (!parsed.success)
    return { response: parsed.error.issues[0].message, status: 400 };
  const data = parsed.data;
  const parent = data.parentId
    ? await getPermission({ userId, collectionId: data.parentId })
    : null;
  if (data.parentId && !parent?.effectivePermission.canCreate)
    return {
      response: "You are not authorized to create a sub-collection here.",
      status: 403,
    };
  const collection = await prisma.collection.create({
    data: {
      ...data,
      name: data.name.trim(),
      ownerId: parent?.ownerId ?? userId,
      createdById: userId,
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { collectionOrder: { push: collection.id } },
  });
  await createFolder({ filePath: "archives/" + collection.id });
  await createFolder({ filePath: "archives/preview/" + collection.id });
  return getCollectionById(userId, collection.id);
}
