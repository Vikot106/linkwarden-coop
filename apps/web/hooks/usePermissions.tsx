import { Member } from "@linkwarden/types/global";
import { useCollections } from "@linkwarden/router/collections";
import { useUser } from "@linkwarden/router/user";

export default function usePermissions(
  collectionId: number
): Member | true | undefined {
  const { data: collections = [] } = useCollections();
  const { data: user } = useUser();
  const collection = collections.find((c) => c.id === collectionId);
  if (!collection || !user) return undefined;
  if (collection.ownerId === user.id) return true;
  const access = collection.effectivePermission;
  if (access)
    return access.canCreate ||
      access.canUpdate ||
      access.canDelete ||
      access.canManage
      ? { ...access, userId: user.id, user }
      : undefined;
  return collection.members.find(
    (m) => m.userId === user.id && (m.canCreate || m.canUpdate || m.canDelete)
  );
}
