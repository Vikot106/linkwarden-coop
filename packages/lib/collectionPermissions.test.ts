import { describe, expect, it } from "vitest";
import { resolveCollectionAccess } from "./collectionPermissions";

const node = (
  overrides: Partial<Parameters<typeof resolveCollectionAccess>[0][number]> = {}
) => ({
  id: 1,
  parentId: null,
  ownerId: 10,
  scope: "PERSONAL" as const,
  members: [],
  groupPermissions: [],
  ...overrides,
});
const group = (permission: "READ" | "EDIT" | "MANAGE") => ({
  permission,
  group: { name: "Engineering" },
});

describe("collection permissions", () => {
  it("keeps personal collections private even for the system administrator", () => {
    expect(resolveCollectionAccess([node()], 20, true).size).toBe(0);
    expect(resolveCollectionAccess([node()], 10).get(1)?.canManage).toBe(true);
  });
  it("grants company read access independently of membership and default groups", () => {
    const access = resolveCollectionAccess(
      [node({ scope: "COMPANY" })],
      20
    ).get(1);
    expect(access).toMatchObject({
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canManage: false,
    });
  });
  it("allows system administrators to manage enterprise resources", () => {
    expect(
      resolveCollectionAccess([node({ scope: "DEPARTMENT" })], 20, true).get(1)
        ?.canManage
    ).toBe(true);
  });
  it("combines direct and multiple group grants without duplicate collections", () => {
    const access = resolveCollectionAccess(
      [
        node({
          members: [
            {
              canCreate: true,
              canUpdate: false,
              canDelete: false,
              canManage: false,
            },
          ],
          groupPermissions: [group("READ"), group("EDIT")],
        }),
      ],
      20
    );
    expect(access.size).toBe(1);
    expect(access.get(1)).toMatchObject({
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canManage: false,
    });
  });
  it("inherits management and category through several levels, regardless of row order", () => {
    const access = resolveCollectionAccess(
      [
        node({ id: 3, parentId: 2 }),
        node({ id: 2, parentId: 1 }),
        node({ scope: "DEPARTMENT", groupPermissions: [group("MANAGE")] }),
      ],
      20
    );
    expect(access.get(3)).toMatchObject({
      canManage: true,
      scope: "DEPARTMENT",
      shared: true,
    });
  });
  it("revokes inherited group access without retaining copied child permissions", () => {
    const tree = [node(), node({ id: 2, parentId: 1 })];
    expect(resolveCollectionAccess(tree, 20).size).toBe(0);
    tree[1].members = [
      {
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canManage: false,
      },
    ] as any;
    expect(resolveCollectionAccess(tree, 20).get(2)?.canUpdate).toBe(false);
    expect(resolveCollectionAccess(tree, 20).has(1)).toBe(false);
  });
  it("terminates when old data contains a parent cycle", () => {
    expect(() =>
      resolveCollectionAccess(
        [node({ parentId: 2 }), node({ id: 2, parentId: 1 })],
        20
      )
    ).not.toThrow();
  });
});
