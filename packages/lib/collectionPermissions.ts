export type Access = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManage: boolean;
  shared: boolean;
  scope: "PERSONAL" | "DEPARTMENT" | "COMPANY";
  sources: string[];
};

type AccessNode = {
  id: number;
  parentId: number | null;
  ownerId: number;
  scope: Access["scope"];
  _count?: { members: number; groupPermissions: number };
  members: {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canManage: boolean;
  }[];
  groupPermissions: {
    permission: "READ" | "EDIT" | "MANAGE";
    group: { name: string };
  }[];
};

// Additive grants, inherited dynamically. Removed memberships leave no copied grants.
export function resolveCollectionAccess(
  nodes: AccessNode[],
  userId: number,
  systemAdmin = false
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<number, Access>();
  const resolved = new Set<number>();
  const visiting = new Set<number>();
  function resolve(id: number): Access | undefined {
    if (resolved.has(id)) return result.get(id);
    if (visiting.has(id)) return undefined;
    const node = byId.get(id);
    if (!node) return undefined;
    visiting.add(id);
    const inherited = node.parentId ? resolve(node.parentId) : undefined;
    const owner = node.ownerId === userId;
    const company = node.scope === "COMPANY";
    const enterpriseAdmin = systemAdmin && node.scope !== "PERSONAL";
    const permissions = node.groupPermissions.map((grant) => grant.permission);
    const manage =
      owner ||
      enterpriseAdmin ||
      node.members.some((m) => m.canManage) ||
      permissions.includes("MANAGE");
    const edit = manage || permissions.includes("EDIT");
    const visible =
      owner ||
      enterpriseAdmin ||
      company ||
      node.members.length > 0 ||
      permissions.length > 0 ||
      !!inherited;
    if (visible) {
      result.set(id, {
        canCreate:
          edit ||
          node.members.some((m) => m.canCreate) ||
          !!inherited?.canCreate,
        canUpdate:
          edit ||
          node.members.some((m) => m.canUpdate) ||
          !!inherited?.canUpdate,
        canDelete:
          edit ||
          node.members.some((m) => m.canDelete) ||
          !!inherited?.canDelete,
        canManage: manage || !!inherited?.canManage,
        shared:
          node.scope !== "PERSONAL" ||
          !!node._count?.members ||
          !!node._count?.groupPermissions ||
          !!inherited?.shared,
        scope:
          inherited?.scope !== undefined && inherited.scope !== "PERSONAL"
            ? inherited.scope
            : node.scope,
        sources: Array.from(
          new Set([
            ...(owner ? ["owner"] : []),
            ...(company ? ["company"] : []),
            ...(enterpriseAdmin ? ["administrator"] : []),
            ...(node.members.length ? ["direct"] : []),
            ...node.groupPermissions.map((g) => g.group.name),
            ...(inherited?.sources ?? []),
          ])
        ),
      });
    }
    visiting.delete(id);
    resolved.add(id);
    return result.get(id);
  }
  for (const node of nodes) resolve(node.id);
  return result;
}
