import { prisma } from "@linkwarden/prisma";
import getPermission from "@/lib/api/getPermission";
import { isSystemAdmin } from "@/lib/api/collectionAccess";
import {
  enterpriseHandler,
  entityId,
  permissionLevel,
  methodNotAllowed,
} from "@/lib/api/enterpriseHandler";
import { z } from "zod";

const grantSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("group"),
    targetId: entityId,
    permission: permissionLevel.nullable(),
  }),
  z.object({
    target: z.literal("user"),
    targetId: entityId,
    permission: permissionLevel.nullable(),
  }),
  z.object({
    target: z.literal("scope"),
    scope: z.enum(["PERSONAL", "DEPARTMENT", "COMPANY"]),
  }),
]);

export default enterpriseHandler(false, async (req, res, user) => {
  const collectionId = entityId.parse(Number(req.query.id));
  const collection = await getPermission({ userId: user.id, collectionId });
  if (!collection?.effectivePermission.canManage)
    return res
      .status(403)
      .json({ response: "Collection management permission required." });
  if (req.method === "GET") {
    const [groups, users] = await Promise.all([
      prisma.collectionGroupPermission.findMany({
        where: { collectionId },
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.usersAndCollections.findMany({
        where: { collectionId },
        include: { user: { select: { id: true, name: true, username: true } } },
      }),
    ]);
    return res
      .status(200)
      .json({ response: { groups, users, scope: collection.scope } });
  }
  if (req.method === "PUT") {
    const data = grantSchema.parse(req.body);
    if (data.target === "scope") {
      if (!isSystemAdmin(user.id) || collection.parentId)
        return res
          .status(403)
          .json({
            response:
              "Only the system administrator can classify root collections.",
          });
      await prisma.collection.update({
        where: { id: collectionId },
        data: { scope: data.scope },
      });
    } else if (data.target === "group") {
      const where = {
        collectionId_groupId: { collectionId, groupId: data.targetId },
      };
      if (data.permission === null)
        await prisma.collectionGroupPermission.deleteMany({
          where: { collectionId, groupId: data.targetId },
        });
      else
        await prisma.collectionGroupPermission.upsert({
          where,
          create: {
            collectionId,
            groupId: data.targetId,
            permission: data.permission,
          },
          update: { permission: data.permission },
        });
    } else {
      if (data.targetId === collection.ownerId)
        return res
          .status(400)
          .json({ response: "The owner's permission cannot be changed." });
      const where = {
        userId_collectionId: { userId: data.targetId, collectionId },
      };
      if (data.permission === null)
        await prisma.usersAndCollections.deleteMany({
          where: { collectionId, userId: data.targetId },
        });
      else {
        const flags = {
          canCreate: data.permission !== "READ",
          canUpdate: data.permission !== "READ",
          canDelete: data.permission !== "READ",
          canManage: data.permission === "MANAGE",
        };
        await prisma.usersAndCollections.upsert({
          where,
          create: { userId: data.targetId, collectionId, ...flags },
          update: flags,
        });
      }
    }
    return res.status(200).json({ response: "Permissions updated." });
  }
  return methodNotAllowed(res, ["GET", "PUT"]);
});
