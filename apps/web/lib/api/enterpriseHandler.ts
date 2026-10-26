import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma, User } from "@linkwarden/prisma/client";
import verifyUser from "./verifyUser";
import { isSystemAdmin } from "./collectionAccess";
import { z } from "zod";

export const entityId = z.number().int().positive();
export const permissionLevel = z.enum(["READ", "EDIT", "MANAGE"]);

export function enterpriseHandler(
  adminOnly: boolean,
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    user: User
  ) => Promise<unknown>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const user = await verifyUser({ req, res });
    if (!user) return;
    res.setHeader("Cache-Control", "private, no-store");
    if (adminOnly && !isSystemAdmin(user.id))
      return res
        .status(403)
        .json({ response: "Administrator access required." });
    if (req.method !== "GET" && process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(403).json({ response: "This demo is read-only." });
    try {
      return await handler(req, res, user);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ response: error.issues[0].message });
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const status =
          error.code === "P2025"
            ? 404
            : ["P2002", "P2003"].includes(error.code)
              ? 409
              : 500;
        return res
          .status(status)
          .json({
            response:
              status === 404
                ? "Resource not found."
                : status === 409
                  ? "Duplicate name or invalid referenced resource."
                  : "Unable to save changes.",
          });
      }
      return res.status(500).json({ response: "Unable to complete request." });
    }
  };
}

export function methodNotAllowed(res: NextApiResponse, methods: string[]) {
  res.setHeader("Allow", methods.join(", "));
  return res.status(405).json({ response: "Method not allowed." });
}
