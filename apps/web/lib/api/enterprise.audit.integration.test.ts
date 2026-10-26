import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@linkwarden/prisma";
import updateCollection from "./controllers/collections/collectionId/updateCollectionById";
import getCollections from "./controllers/collections/getCollections";
import updateLinks from "./controllers/links/bulk/updateLinks";
import getTags from "./controllers/tags/getTags";
import getTagById from "./controllers/tags/tagId/getTagById";
import deleteCollection from "./controllers/collections/collectionId/deleteCollectionById";
import deleteUser from "./controllers/users/userId/deleteUserById";
import importLinkwarden from "./controllers/migration/importFromLinkwarden";
import importPocket from "./controllers/migration/importFromPocket";
import importWallabag from "./controllers/migration/importFromWallabag";
import importOmnivore from "./controllers/migration/importFromOmnivore";
import { TagSort } from "@linkwarden/types/global";

const files = vi.hoisted(() => ({ removeFolder: vi.fn(async () => {}) }));
vi.mock("@linkwarden/filesystem", () => ({
  ...files,
  createFolder: vi.fn(),
  moveFiles: vi.fn(),
  removeFiles: vi.fn(),
}));

describe.skipIf(!process.env.ENTERPRISE_TEST_DATABASE_URL)(
  "enterprise requirements audit regressions",
  () => {
    const userIds: number[] = [];
    let owner: number, editor: number, root: number, privateId: number;
    beforeAll(async () => {
      const url = new URL(process.env.ENTERPRISE_TEST_DATABASE_URL!);
      if (
        process.env.DATABASE_URL !== url.href ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "55432" ||
        url.pathname !== "/enterprise_test"
      )
        throw new Error(
          "Audit tests require the isolated enterprise_test database."
        );
      for (const suffix of ["owner", "editor"]) {
        const user = await prisma.user.create({
          data: { username: `audit_${suffix}_${Date.now()}` },
        });
        userIds.push(user.id);
      }
      [owner, editor] = userIds;
      root = (
        await prisma.collection.create({
          data: {
            name: "Shared audit root",
            ownerId: owner,
            members: {
              create: {
                userId: editor,
                canCreate: true,
                canUpdate: true,
                canDelete: true,
                canManage: true,
              },
            },
          },
        })
      ).id;
      privateId = (
        await prisma.collection.create({
          data: { name: "Private audit root", ownerId: owner },
        })
      ).id;
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });
    const freshCollection = async (id: number) =>
      (await getCollections(owner)).response.find((c) => c.id === id)!;
    const newLink = () =>
      prisma.link.create({
        data: {
          name: "Audit link",
          url: "https://example.com",
          collectionId: root,
        },
      });

    it("preserves shared contributions when deleting their author", async () => {
      const author = await prisma.user.create({
        data: { username: `audit_author_${Date.now()}` },
      });
      userIds.push(author.id);
      const contribution = await prisma.link.create({
        data: {
          name: "Employee contribution",
          collectionId: root,
          createdById: author.id,
        },
      });
      const personal = await prisma.collection.create({
        data: { name: "Author private", ownerId: author.id },
      });
      await prisma.user.delete({ where: { id: author.id } });
      expect(
        await prisma.link.findUnique({ where: { id: contribution.id } })
      ).toMatchObject({ createdById: null, collectionId: root });
      expect(
        await prisma.collection.findUnique({ where: { id: personal.id } })
      ).toBeNull();
    });

    it("blocks account deletion until enterprise resource ownership is transferred", async () => {
      const target = await prisma.user.create({
        data: { username: `audit_corporate_owner_${Date.now()}` },
      });
      userIds.push(target.id);
      const enterpriseCollection = await prisma.collection.create({
        data: {
          name: "Protected company",
          ownerId: target.id,
          scope: "COMPANY",
        },
      });
      expect(
        (await deleteUser(owner, { password: "" }, true, target.id)).status
      ).toBe(409);
      expect(
        await prisma.user.findUnique({ where: { id: target.id } })
      ).not.toBeNull();
      expect(
        await prisma.collection.findUnique({
          where: { id: enterpriseCollection.id },
        })
      ).not.toBeNull();
    });

    it("reports failure when account deletion does not commit", async () => {
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockRejectedValueOnce(new Error("audit injected transaction failure"));
      try {
        expect(
          (await deleteUser(owner, { password: "" }, true, editor)).status
        ).toBe(500);
        expect(
          await prisma.user.findUnique({ where: { id: editor } })
        ).not.toBeNull();
      } finally {
        transaction.mockRestore();
      }
    });

    it("does not report success or update other items when a requested bulk link is missing", async () => {
      const link = await newLink();
      const result = await updateLinks(
        owner,
        [{ id: link.id }, { id: 2147483647 }],
        false,
        { tags: [{ name: "unexpected-tag" }] }
      );
      expect(result.status).not.toBe(200);
      expect(
        (
          await prisma.link.findUniqueOrThrow({
            where: { id: link.id },
            include: { tags: true },
          })
        ).tags
      ).toHaveLength(0);
    });

    it("honors the version supplied by a bulk editor instead of replacing it with the current version", async () => {
      const link = await newLink();
      await prisma.link.update({
        where: { id: link.id },
        data: { version: { increment: 1 } },
      });
      const selected = [{ id: link.id, version: link.version }];
      const result = await updateLinks(owner, selected, true, {
        tags: [{ name: "stale-tag" }],
      });
      expect(result.status).toBe(409);
      expect(
        (
          await prisma.link.findUniqueOrThrow({
            where: { id: link.id },
            include: { tags: true },
          })
        ).tags
      ).toHaveLength(0);
    });

    it("updates a bulk selection with matching versions and rejects shared updates without versions", async () => {
      const link = await newLink();
      expect(
        (await updateLinks(owner, [{ id: link.id }], true, { tags: [] })).status
      ).toBe(409);
      expect(
        (
          await updateLinks(
            owner,
            [{ id: link.id, version: link.version }],
            true,
            { tags: [{ name: "audit-bulk-success" }] }
          )
        ).status
      ).toBe(200);
      const saved = await prisma.link.findUniqueOrThrow({
        where: { id: link.id },
        include: { tags: true },
      });
      expect(saved.version).toBe(link.version + 1);
      expect(saved.tags.map((tag) => tag.name)).toEqual(["audit-bulk-success"]);
    });

    it("rejects a stale collection form instead of overwriting a newer name and description", async () => {
      const original = await freshCollection(root);
      expect(
        (
          await updateCollection(owner, root, {
            ...original,
            name: "First editor",
          })
        ).status
      ).toBe(200);
      expect(
        (
          await updateCollection(editor, root, {
            ...original,
            description: "Stale second editor",
          })
        ).status
      ).toBe(409);
      expect(
        await prisma.collection.findUnique({ where: { id: root } })
      ).toMatchObject({
        name: "First editor",
        description: original.description,
      });
    });

    it("prevents simultaneous opposite moves from introducing a parent cycle", async () => {
      const a = await prisma.collection.create({
        data: { name: "Move A", ownerId: owner },
      });
      const b = await prisma.collection.create({
        data: { name: "Move B", ownerId: owner },
      });
      const first = await freshCollection(a.id),
        second = await freshCollection(b.id);
      const results = await Promise.all([
        updateCollection(owner, a.id, { ...first, parentId: b.id }),
        updateCollection(owner, b.id, { ...second, parentId: a.id }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const parents = await prisma.collection.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(parents.filter((p) => p.parentId === null)).toHaveLength(1);
    });

    it("does not expose private link counts through a shared or public tag", async () => {
      const tag = await prisma.tag.create({
        data: { name: "audit-common-tag", ownerId: owner },
      });
      for (const collectionId of [root, privateId]) {
        await prisma.link.create({
          data: {
            name: "Tagged",
            collectionId,
            tags: { connect: { id: tag.id } },
          },
        });
      }
      const listing = await getTags({ userId: editor });
      expect(
        listing.data.tags?.find((t) => t.id === tag.id)?._count.links
      ).toBe(1);
      expect((await getTagById(editor, tag.id)).response).toMatchObject({
        _count: { links: 1 },
      });
      await prisma.collection.update({
        where: { id: root },
        data: { isPublic: true },
      });
      const publicListing = await getTags({ collectionId: root });
      expect(
        publicListing.data.tags?.find((t) => t.id === tag.id)?._count.links
      ).toBe(1);
    });

    it("sorts and paginates tags using only the viewer's accessible link counts", async () => {
      const hiddenHeavy = await prisma.tag.create({
        data: { name: "audit-hidden-heavy", ownerId: owner },
      });
      const visibleHeavy = await prisma.tag.create({
        data: { name: "audit-visible-heavy", ownerId: owner },
      });
      for (const [tagId, collectionIds] of [
        [hiddenHeavy.id, [root, privateId, privateId, privateId]],
        [visibleHeavy.id, [root, root]],
      ] as const) {
        for (const collectionId of collectionIds)
          await prisma.link.create({
            data: {
              name: "Counted",
              collectionId,
              tags: { connect: { id: tagId } },
            },
          });
      }
      vi.stubEnv("PAGINATION_TAKE_COUNT", "1");
      try {
        const first = await getTags({
          userId: editor,
          query: { search: "audit-", sort: TagSort.LinkCountHighLow },
        });
        expect(first.data.tags?.[0]).toMatchObject({
          id: visibleHeavy.id,
          _count: { links: 2 },
        });
        const second = await getTags({
          userId: editor,
          query: {
            search: "audit-",
            sort: TagSort.LinkCountHighLow,
            cursor: first.data.nextCursor!,
          },
        });
        expect(second.data.tags?.[0]).toMatchObject({
          id: hiddenHeavy.id,
          _count: { links: 1 },
        });
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rolls back a whole subtree when the database rejects the root deletion", async () => {
      const target = await prisma.collection.create({
        data: { name: "Rollback root", ownerId: owner },
      });
      const child = await prisma.collection.create({
        data: { name: "Rollback child", ownerId: owner, parentId: target.id },
      });
      const link = await prisma.link.create({
        data: { name: "Rollback link", collectionId: child.id },
      });
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION audit_reject_root_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = ${target.id} THEN RAISE EXCEPTION 'audit injected failure'; END IF; RETURN OLD; END $$`
      );
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER audit_reject_root_delete BEFORE DELETE ON "Collection" FOR EACH ROW EXECUTE FUNCTION audit_reject_root_delete()'
      );
      files.removeFolder.mockClear();
      try {
        await expect(deleteCollection(owner, target.id)).rejects.toThrow();
        expect(
          await prisma.collection.findUnique({ where: { id: child.id } })
        ).not.toBeNull();
        expect(
          await prisma.link.findUnique({ where: { id: link.id } })
        ).not.toBeNull();
        expect(files.removeFolder).not.toHaveBeenCalled();
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER audit_reject_root_delete ON "Collection"'
        );
        await prisma.$executeRawUnsafe(
          "DROP FUNCTION audit_reject_root_delete()"
        );
      }
    });

    it("deletes an entire subtree and clears every user's ordering after committing", async () => {
      const target = await prisma.collection.create({
        data: { name: "Successful deletion", ownerId: owner },
      });
      const child = await prisma.collection.create({
        data: { name: "Deleted child", ownerId: owner, parentId: target.id },
      });
      await prisma.link.create({
        data: { name: "Deleted link", collectionId: child.id },
      });
      await prisma.user.update({
        where: { id: editor },
        data: { collectionOrder: [privateId, target.id, child.id] },
      });
      await prisma.dashboardSection.create({
        data: {
          userId: editor,
          collectionId: child.id,
          type: "COLLECTION",
          order: 0,
        },
      });
      files.removeFolder.mockClear();
      expect((await deleteCollection(owner, target.id)).status).toBe(200);
      expect(
        await prisma.collection.count({
          where: { id: { in: [target.id, child.id] } },
        })
      ).toBe(0);
      expect(
        await prisma.link.count({ where: { collectionId: child.id } })
      ).toBe(0);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: editor } }))
          .collectionOrder
      ).toEqual([privateId]);
      expect(
        await prisma.dashboardSection.count({
          where: { userId: editor, collectionId: child.id },
        })
      ).toBe(0);
      expect(files.removeFolder).toHaveBeenCalledTimes(4);
    });

    it.each([
      [
        "Linkwarden",
        importLinkwarden,
        JSON.stringify({
          collections: [
            {
              name: "Audit import",
              links: ["first", "audit_import_failure"].map((name) => ({
                name,
                url: "https://example.com",
                createdAt: "2026-10-26T00:00:00Z",
                tags: [],
              })),
            },
          ],
          pinnedLinks: [],
        }),
      ],
      [
        "Pocket",
        importPocket,
        "title,url,time_added,tags,status\nfirst,https://example.com,1792992000,,unread\naudit_import_failure,https://example.com,1792992000,,unread",
      ],
      [
        "Wallabag",
        importWallabag,
        JSON.stringify(
          ["first", "audit_import_failure"].map((title) => ({
            title,
            url: "https://example.com",
            created_at: "2026-10-26T00:00:00Z",
            tags: [],
          }))
        ),
      ],
      [
        "Omnivore",
        importOmnivore,
        JSON.stringify(
          ["first", "audit_import_failure"].map((title) => ({
            title,
            url: "https://example.com",
            savedAt: "2026-10-26T00:00:00Z",
            labels: [],
            description: "",
          }))
        ),
      ],
    ])(
      "rolls back %s imports and reports failure when one item cannot be saved",
      async (_, importer, payload) => {
        const beforeCollections = await prisma.collection.count({
          where: { ownerId: owner },
        });
        const beforeLinks = await prisma.link.count({
          where: { collection: { ownerId: owner } },
        });
        await prisma.$executeRawUnsafe(
          `CREATE FUNCTION audit_reject_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'audit_import_failure' THEN RAISE EXCEPTION 'audit injected import failure'; END IF; RETURN NEW; END $$`
        );
        await prisma.$executeRawUnsafe(
          'CREATE TRIGGER audit_reject_import BEFORE INSERT ON "Link" FOR EACH ROW EXECUTE FUNCTION audit_reject_import()'
        );
        try {
          expect((await importer(owner, payload)).status).toBe(500);
          expect(
            await prisma.collection.count({ where: { ownerId: owner } })
          ).toBe(beforeCollections);
          expect(
            await prisma.link.count({
              where: { collection: { ownerId: owner } },
            })
          ).toBe(beforeLinks);
        } finally {
          await prisma.$executeRawUnsafe(
            'DROP TRIGGER audit_reject_import ON "Link"'
          );
          await prisma.$executeRawUnsafe("DROP FUNCTION audit_reject_import()");
        }
      }
    );
  }
);
