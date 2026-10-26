import { Member } from "@linkwarden/types/global";
import { useCollections } from "@linkwarden/router/collections";
import { useUser } from "@linkwarden/router/user";

export default function useCollectivePermissions(
  collectionIds: number[]
): Member | true | undefined {
  const { data: collections = [] } = useCollections();
  const { data: user } = useUser();
  if (!user || !collectionIds.length) return undefined;
  const grants = collectionIds.map((id) => {
    const c = collections.find((item) => item.id === id);
    if (c?.ownerId === user.id)
      return {
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canManage: true,
      };
    return (
      c?.effectivePermission ?? c?.members.find((m) => m.userId === user.id)
    );
  });
  const permissions = {
    userId: user.id,
    user,
    canCreate: grants.every((g) => g?.canCreate),
    canUpdate: grants.every((g) => g?.canUpdate),
    canDelete: grants.every((g) => g?.canDelete),
  };
  return permissions.canCreate || permissions.canUpdate || permissions.canDelete
    ? permissions
    : undefined;
}
