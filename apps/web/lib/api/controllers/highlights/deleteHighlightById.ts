import getPermission from "@/lib/api/getPermission";
import { prisma } from "@linkwarden/prisma";

export default async function deleteHighlightById(
  userId: number,
  highlightId: number
) {
  if (!highlightId)
    return { response: "Please choose a valid highlight.", status: 401 };

  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId, userId },
  });
  const access =
    highlight && (await getPermission({ userId, linkId: highlight.linkId }));
  if (!access?.effectivePermission.canUpdate)
    return { response: "Collection is not accessible.", status: 403 };
  const targetHighlight = await prisma.highlight.delete({
    where: {
      id: highlightId,
      userId,
    },
  });

  return { response: targetHighlight.id, status: 200 };
}
