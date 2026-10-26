import { prisma } from "@linkwarden/prisma";
import { getCollectionAccess } from "./collectionAccess";

export default async function getAccessibleCollectionIds(userId: number) {
  const [access, owned] = await Promise.all([
    getCollectionAccess(userId),
    prisma.collection.findMany({
      where: { ownerId: userId },
      select: { id: true },
    }),
  ]);
  const ownedCollectionIds = owned.map((c) => c.id);
  const ownedSet = new Set(ownedCollectionIds);
  const accessibleCollectionIds = Array.from(access.keys());
  return {
    ownedCollectionIds,
    memberCollectionIds: accessibleCollectionIds.filter(
      (id) => !ownedSet.has(id)
    ),
    accessibleCollectionIds,
  };
}
