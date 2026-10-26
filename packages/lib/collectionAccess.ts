import { prisma } from "@linkwarden/prisma";
import { resolveCollectionAccess } from "./collectionPermissions";

// Request-local only: never cache authorization across requests or users.
export async function getCollectionAccess(userId: number) {
  const collections = await prisma.collection.findMany({
    select: {
      id: true,
      parentId: true,
      ownerId: true,
      scope: true,
      _count: { select: { members: true, groupPermissions: true } },
      members: {
        where: { userId },
        select: {
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          canManage: true,
        },
      },
      groupPermissions: {
        where: { group: { members: { some: { userId } } } },
        select: { permission: true, group: { select: { name: true } } },
      },
    },
  });
  return resolveCollectionAccess(collections, userId, isSystemAdmin(userId));
}

export function isSystemAdmin(userId: number) {
  return userId === Number(process.env.NEXT_PUBLIC_ADMIN || 1);
}

export async function defaultGroupMemberships() {
  const groups = await prisma.userGroup.findMany({
    where: { isDefault: true },
    select: { id: true },
  });
  return {
    create: groups.map((group) => ({ group: { connect: { id: group.id } } })),
  };
}
