import getPermission from "@/lib/api/getPermission";
import { prisma } from "@linkwarden/prisma";

export default async function getLinkHighlights({
  userId,
  linkId,
}: {
  userId: number;
  linkId: number;
}) {
  if (!(await getPermission({ userId, linkId })))
    return { response: "Collection is not accessible.", status: 403 };
  const highlights = await prisma.highlight.findMany({
    where: {
      linkId,
      userId,
    },
  });

  return { response: highlights, status: 200 };
}
