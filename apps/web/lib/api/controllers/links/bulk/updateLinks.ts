import updateLinkById from "../linkId/updateLinkById";
import { UpdateLinkSchemaType } from "@linkwarden/lib/schemaValidation";
import { prisma } from "@linkwarden/prisma";
import { z } from "zod";

const bulkUpdateSchema = z.object({
  links: z
    .array(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().nonnegative().optional(),
      })
    )
    .min(1)
    .max(500),
  removePreviousTags: z.boolean().default(false),
  newData: z.object({
    tags: z
      .array(z.object({ name: z.string().trim().min(1).max(50) }))
      .default([]),
    collectionId: z.number().int().positive().nullish(),
  }),
});

export default async function updateLinks(
  userId: number,
  links: { id: number; version?: number }[],
  removePreviousTags: boolean,
  newData: { tags: { name: string }[]; collectionId?: number | null }
) {
  const parsed = bulkUpdateSchema.safeParse({
    links,
    removePreviousTags,
    newData,
  });
  if (!parsed.success)
    return { response: parsed.error.issues[0].message, status: 400 };
  ({ links, removePreviousTags, newData } = parsed.data);
  let failureStatus = 0;

  const ids = links.map((l) => l.id);

  const dbLinks = await prisma.link.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      version: true,
      name: true,
      url: true,
      description: true,
      icon: true,
      iconWeight: true,
      color: true,
      collectionId: true,
      collection: { select: { id: true, ownerId: true } },
      tags: { select: { name: true } },
    },
  });

  // Map id -> link for quick lookup
  const byId = new Map(dbLinks.map((l) => [l.id, l]));
  if (new Set(ids).size !== dbLinks.length)
    return {
      response:
        "Some links are missing or no longer accessible. Reload before editing.",
      status: 404,
    };

  for (const l of links) {
    const link = byId.get(l.id);

    if (!link) continue;

    const updatedData: UpdateLinkSchemaType = {
      ...link,
      version: l.version,
      tags: [...(newData.tags ?? [])],
      collection: {
        ...link.collection,
        id: newData.collectionId ?? link.collection.id,
      },
    };

    const updatedLink = await updateLinkById(
      userId,
      link.id as number,
      updatedData,
      removePreviousTags
    );

    if (updatedLink.status !== 200) {
      failureStatus =
        updatedLink.status === 409 ? 409 : failureStatus || updatedLink.status;
    }
  }

  if (!failureStatus) {
    return { response: "All links updated successfully", status: 200 };
  } else {
    return {
      response: "Some links failed to update. Reload the list before retrying.",
      status: failureStatus,
    };
  }
}
