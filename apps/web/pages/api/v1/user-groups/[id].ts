import { prisma } from "@linkwarden/prisma";
import {
  enterpriseHandler,
  entityId,
  methodNotAllowed,
} from "@/lib/api/enterpriseHandler";
import { groupSchema } from "./index";
import { z } from "zod";

const membershipSchema = z
  .object({
    add: z.array(entityId).max(500).default([]),
    remove: z.array(entityId).max(500).default([]),
  })
  .refine(
    (data) => !data.add.some((id) => data.remove.includes(id)),
    "A user cannot be added and removed together."
  );

export default enterpriseHandler(true, async (req, res) => {
  const id = entityId.parse(Number(req.query.id));
  if (req.method === "PUT") {
    const group = await prisma.userGroup.update({
      where: { id },
      data: groupSchema.parse(req.body),
    });
    return res.status(200).json({ response: group });
  }
  if (req.method === "PATCH") {
    const { add, remove } = membershipSchema.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.userGroup.findUniqueOrThrow({ where: { id } });
      await tx.userGroupMember.deleteMany({
        where: { groupId: id, userId: { in: remove } },
      });
      await tx.userGroupMember.createMany({
        data: Array.from(new Set(add)).map((userId) => ({
          groupId: id,
          userId,
        })),
        skipDuplicates: true,
      });
    });
    return res.status(200).json({ response: "Memberships updated." });
  }
  if (req.method === "DELETE") {
    await prisma.userGroup.delete({ where: { id } });
    return res.status(200).json({ response: "Group deleted." });
  }
  return methodNotAllowed(res, ["PUT", "PATCH", "DELETE"]);
});
