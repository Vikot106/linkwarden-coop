import { prisma } from "@linkwarden/prisma";
import {
  enterpriseHandler,
  methodNotAllowed,
} from "@/lib/api/enterpriseHandler";

export default enterpriseHandler(false, async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  return res.status(200).json({
    response: await prisma.userGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  });
});
