import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@linkwarden/prisma";
import {
  getCollectionAccess,
  defaultGroupMemberships,
} from "./collectionAccess";
import getPermission from "./getPermission";
import getCollections from "./controllers/collections/getCollections";
import updateCollection from "./controllers/collections/collectionId/updateCollectionById";
import updateLink from "./controllers/links/linkId/updateLinkById";
import getLink from "./controllers/links/linkId/getLinkById";
import searchLinks from "./controllers/search/searchLinks";
import exportData from "./controllers/migration/exportData";
import resolveAccessibleArchive from "./archives/resolveAccessibleArchive";
import setCollection from "./setCollection";
import groupsApi from "@/pages/api/v1/user-groups/index";
import groupApi from "@/pages/api/v1/user-groups/[id]";
import permissionsApi from "@/pages/api/v1/collections/[id]/permissions";
import createPreservedFormatUrl from "./preserved/createPreservedFormatUrl";
import preservedView from "@/pages/api/v1/preserved/view";
import { ArchivedFormat } from "@linkwarden/types/global";

const auth = vi.hoisted(() => ({ id: 0 }));
vi.mock("./verifyUser", () => ({ default: async () => ({ id: auth.id }) }));
vi.mock("@linkwarden/filesystem", () => ({
  moveFiles: vi.fn(),
  removeFiles: vi.fn(),
}));

describe.skipIf(!process.env.ENTERPRISE_TEST_DATABASE_URL)(
  "enterprise PostgreSQL integration",
  () => {
    const prefix = `enterprise_test_${Date.now()}`;
    const users: number[] = [];
    const groupIds: number[] = [];
    let admin: number, owner: number, employee: number, viewer: number;
    let groupId: number,
      department: number,
      child: number,
      privateId: number,
      company: number,
      linkId: number;
    beforeAll(async () => {
      const url = new URL(process.env.ENTERPRISE_TEST_DATABASE_URL!);
      if (
        process.env.DATABASE_URL !== url.href ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "55432" ||
        url.pathname !== "/enterprise_test"
      )
        throw new Error(
          "Enterprise tests require the isolated local enterprise_test database on port 55432."
        );
      vi.stubEnv("MEILI_HOST", "");
      for (const suffix of ["admin", "owner", "employee", "viewer"]) {
        users.push(
          (
            await prisma.user.create({
              data: { username: `${prefix}_${suffix}` },
            })
          ).id
        );
      }
      [admin, owner, employee, viewer] = users;
      vi.stubEnv("NEXT_PUBLIC_ADMIN", String(admin));
      vi.stubEnv("NEXT_PUBLIC_DEMO", "false");
      const group = await prisma.userGroup.create({
        data: {
          name: `${prefix}_engineering`,
          isDefault: true,
          members: { create: { userId: employee } },
        },
      });
      groupId = group.id;
      groupIds.push(groupId);
      department = (
        await prisma.collection.create({
          data: {
            name: "Engineering",
            ownerId: owner,
            scope: "DEPARTMENT",
            groupPermissions: { create: { groupId, permission: "EDIT" } },
          },
        })
      ).id;
      child = (
        await prisma.collection.create({
          data: { name: "Child", ownerId: owner, parentId: department },
        })
      ).id;
      privateId = (
        await prisma.collection.create({
          data: { name: "Private", ownerId: owner },
        })
      ).id;
      company = (
        await prisma.collection.create({
          data: { name: "Company", ownerId: admin, scope: "COMPANY" },
        })
      ).id;
      linkId = (
        await prisma.link.create({
          data: {
            name: "Shared link",
            url: "https://example.com/",
            collectionId: child,
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (groupIds.length)
        await prisma.userGroup.deleteMany({ where: { id: { in: groupIds } } });
      if (users.length)
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      vi.unstubAllEnvs();
      await prisma.$disconnect();
    });
    const api = async (
      handler: typeof groupsApi,
      actor: number,
      method: string,
      id?: number,
      body?: unknown
    ) => {
      auth.id = actor;
      let status = 200,
        result: any;
      const res: any = {
        setHeader: vi.fn(),
        status: (value: number) => {
          status = value;
          return res;
        },
        json: (value: unknown) => {
          result = value;
          return res;
        },
      };
      await handler(
        { method, query: id ? { id: String(id) } : {}, body } as any,
        res
      );
      return { status, body: result };
    };
    it("shows one shared tree automatically, keeps private data hidden, and grants only company read access to other users", async () => {
      const collections = (await getCollections(employee)).response;
      expect(collections.filter((c) => c.id === department)).toHaveLength(1);
      expect(collections.some((c) => c.id === child)).toBe(true);
      expect(collections.some((c) => c.id === privateId)).toBe(false);
      expect(
        await getPermission({ userId: admin, collectionId: privateId })
      ).toBeNull();
      expect((await getCollectionAccess(viewer)).get(company)?.canUpdate).toBe(
        false
      );
      expect(
        await setCollection({ userId: viewer, collectionId: company })
      ).toBeNull();
    });
    it("assigns independently configured default groups during account creation", async () => {
      const user = await prisma.user.create({
        data: {
          username: `${prefix}_new`,
          groupMemberships: await defaultGroupMemberships(),
        },
      });
      users.push(user.id);
      expect((await getCollectionAccess(user.id)).has(department)).toBe(true);
      await prisma.userGroupMember.delete({
        where: { groupId_userId: { groupId, userId: user.id } },
      });
      expect((await getCollectionAccess(user.id)).has(department)).toBe(false);
      expect((await getCollectionAccess(user.id)).has(company)).toBe(true);
    });
    it("rejects forged group/permission requests from ordinary users", async () => {
      expect(
        (await api(groupsApi, employee, "POST", undefined, { name: "forged" }))
          .status
      ).toBe(403);
      expect(
        (
          await api(groupApi, employee, "PATCH", groupId, {
            add: [viewer],
            role: "admin",
          })
        ).status
      ).toBe(403);
      expect(
        (
          await api(permissionsApi, employee, "PUT", department, {
            target: "group",
            targetId: groupId,
            permission: "MANAGE",
          })
        ).status
      ).toBe(403);
      const collection = (await getCollections(employee)).response.find(
        (c) => c.id === department
      )!;
      expect(
        (
          await updateCollection(employee, department, {
            ...collection,
            isPublic: true,
          })
        ).status
      ).toBe(403);
    });
    it("allows editors to change child metadata while preventing read-only writes", async () => {
      const collection = (await getCollections(employee)).response.find(
        (c) => c.id === child
      )!;
      expect(
        (
          await updateCollection(employee, child, {
            ...collection,
            name: "Edited child",
          })
        ).status
      ).toBe(200);
      const grant = await api(permissionsApi, owner, "PUT", department, {
        target: "user",
        targetId: viewer,
        permission: "READ",
      });
      expect(grant.status).toBe(200);
      expect(
        (
          await updateCollection(viewer, child, {
            ...collection,
            name: "forged",
          })
        ).status
      ).toBe(403);
    });
    it("detects concurrent edits atomically and ignores a forged target owner", async () => {
      const link = await prisma.link.findUniqueOrThrow({
        where: { id: linkId },
        include: { tags: true, collection: true },
      });
      const body = {
        ...link,
        collection: { id: child, ownerId: viewer },
        tags: [],
      };
      const results = await Promise.all([
        updateLink(employee, linkId, { ...body, name: "A" }),
        updateLink(owner, linkId, { ...body, name: "B" }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await updateLink(viewer, linkId, body)).status).toBe(403);
      const fresh = await prisma.link.findUniqueOrThrow({
        where: { id: linkId },
      });
      expect(
        (await updateLink(employee, linkId, { ...body, version: undefined }))
          .status
      ).toBe(409);
      expect(fresh.version).toBe(link.version + 1);
    });
    it("prevents a move to an inaccessible collection and parent cycles", async () => {
      const link = await prisma.link.findUniqueOrThrow({
        where: { id: linkId },
        include: { tags: true, collection: true },
      });
      expect(
        (
          await updateLink(employee, linkId, {
            ...link,
            collection: { id: privateId, ownerId: owner },
          })
        ).status
      ).toBe(403);
      const root = (await getCollections(owner)).response.find(
        (c) => c.id === department
      )!;
      expect(
        (
          await updateCollection(owner, department, {
            ...root,
            parentId: child,
          })
        ).status
      ).toBe(400);
    });
    it("revokes a group immediately across old links, search, archive and export paths while retaining other grants", async () => {
      vi.stubEnv("NEXTAUTH_SECRET", "enterprise-test-secret");
      vi.stubEnv(
        "NEXT_PUBLIC_USER_CONTENT_DOMAIN",
        "https://content.example.com"
      );
      const signedUrl = await createPreservedFormatUrl({
        linkId,
        userId: employee,
        filePath: `archives/${child}/${linkId}.html`,
        format: ArchivedFormat.monolith,
      });
      await prisma.link.update({
        where: { id: linkId },
        data: { pinnedBy: { connect: { id: employee } } },
      });
      expect(
        (await api(groupApi, admin, "PATCH", groupId, { remove: [employee] }))
          .status
      ).toBe(200);
      expect((await getLink(employee, linkId)).status).not.toBe(200);
      let archiveStatus = 200;
      const res: any = {
        status: (code: number) => {
          archiveStatus = code;
          return res;
        },
        json: () => res,
      };
      await preservedView(
        {
          method: "GET",
          query: { token: new URL(signedUrl).searchParams.get("token") },
          headers: { host: "content.example.com" },
        } as any,
        res
      );
      expect(archiveStatus).toBe(401);
      expect(
        await getPermission({ userId: employee, collectionId: child })
      ).toBeNull();
      expect(
        (
          await resolveAccessibleArchive({
            userId: employee,
            linkId,
            format: 0,
          })
        ).status
      ).not.toBe(200);
      const search = await searchLinks({
        userId: employee,
        query: { collectionId: child },
      });
      expect((search.data as any).links ?? search.data).toHaveLength(0);
      const exported = (await exportData(employee)).response as any;
      expect(exported.pinnedLinks).toHaveLength(0);
      expect((await getCollectionAccess(viewer)).get(child)?.canUpdate).toBe(
        false
      );
      expect((await getCollectionAccess(employee)).has(company)).toBe(true);
      expect(
        (
          await api(groupApi, admin, "PATCH", groupId, {
            add: [employee, employee],
          })
        ).status
      ).toBe(200);
      expect((await getCollectionAccess(employee)).get(child)?.canUpdate).toBe(
        true
      );
    });
    it("validates malformed grants and allows a manager to revoke one source without removing another", async () => {
      expect(
        (
          await api(permissionsApi, owner, "PUT", department, {
            target: "group",
            targetId: groupId,
            permission: "ROOT",
          })
        ).status
      ).toBe(400);
      expect(
        (
          await api(permissionsApi, owner, "PUT", department, {
            target: "user",
            targetId: viewer,
            permission: "MANAGE",
          })
        ).status
      ).toBe(200);
      expect(
        (
          await api(permissionsApi, viewer, "PUT", department, {
            target: "user",
            targetId: employee,
            permission: "READ",
          })
        ).status
      ).toBe(200);
      expect(
        (
          await api(permissionsApi, owner, "PUT", department, {
            target: "group",
            targetId: groupId,
            permission: null,
          })
        ).status
      ).toBe(200);
      expect((await getCollectionAccess(employee)).get(child)).toMatchObject({
        canUpdate: false,
        canManage: false,
      });
      expect(
        (
          await api(permissionsApi, viewer, "PUT", department, {
            target: "scope",
            scope: "COMPANY",
          })
        ).status
      ).toBe(403);
    });
  }
);
