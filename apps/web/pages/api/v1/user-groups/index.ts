import { prisma } from "@linkwarden/prisma";
import {
  enterpriseHandler,
  methodNotAllowed,
} from "@/lib/api/enterpriseHandler";
import { z } from "zod";

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2048).default(""),
  isDefault: z.boolean().default(false),
});

export default enterpriseHandler(true, async (req, res) => {
  if (req.method === "GET") {
    const groups = await prisma.userGroup.findMany({
      orderBy: { name: "asc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        permissions: { select: { collectionId: true, permission: true } },
      },
    });
    return res.status(200).json({ response: groups });
  }
  if (req.method === "POST") {
    const group = await prisma.userGroup.create({
      data: groupSchema.parse(req.body),
    });
    return res.status(201).json({ response: group });
  }
  return methodNotAllowed(res, ["GET", "POST"]);
});
