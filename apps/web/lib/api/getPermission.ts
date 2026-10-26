import { prisma } from "@linkwarden/prisma";
import { getCollectionAccess } from "./collectionAccess";

type Props = { userId: number; collectionId?: number; linkId?: number };

export default async function getPermission({
  userId,
  collectionId,
  linkId,
}: Props) {
  if (linkId) {
    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { collectionId: true },
    });
    collectionId = link?.collectionId;
  }
  if (!collectionId) return null;
  const access = (await getCollectionAccess(userId)).get(collectionId);
  if (!access) return null;
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: { members: true },
  });
  if (!collection) return null;
  // Effective member for existing link/archive controllers; never persisted.
  return {
    ...collection,
    effectivePermission: access,
    members: [
      ...collection.members.filter((member) => member.userId !== userId),
      {
        userId,
        collectionId,
        canCreate: access.canCreate,
        canUpdate: access.canUpdate,
        canDelete: access.canDelete,
        canManage: access.canManage,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      },
    ],
  };
}
