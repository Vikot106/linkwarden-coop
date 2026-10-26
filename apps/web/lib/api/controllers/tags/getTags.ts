import getAccessibleCollectionIds from "@/lib/api/getAccessibleCollectionIds";
import { prisma } from "@linkwarden/prisma";
import { TagRequestQuery, TagSort } from "@linkwarden/types/global";
import { Prisma } from "@linkwarden/prisma/client";

export default async function getTags({
  userId,
  collectionId,
  query = {},
}: {
  userId?: number;
  collectionId?: number;
  query?: TagRequestQuery;
}) {
  let search = query.search?.trim();
  if (search) {
    try {
      search = decodeURIComponent(search).trim();
    } catch {}
  }
  const searchCondition: Prisma.TagWhereInput = search
    ? {
        name: {
          contains: search,
          mode: process.env.DATABASE_URL?.startsWith("postgresql")
            ? "insensitive"
            : undefined,
        },
      }
    : {};
  const take = Number(process.env.PAGINATION_TAKE_COUNT) || 50;
  let orderBy: Prisma.TagOrderByWithRelationInput[] = [{ id: "desc" }];
  if (query.sort === TagSort.DateOldestFirst) orderBy = [{ id: "asc" }];
  else if (query.sort === TagSort.NameAZ)
    orderBy = [{ name: "asc" }, { id: "asc" }];
  else if (query.sort === TagSort.NameZA)
    orderBy = [{ name: "desc" }, { id: "desc" }];

  if (userId) {
    const { memberCollectionIds, accessibleCollectionIds } =
      await getAccessibleCollectionIds(userId);
    const sortByCount =
      query.sort === TagSort.LinkCountHighLow ||
      query.sort === TagSort.LinkCountLowHigh;
    const matching = await prisma.tag.findMany({
      take: sortByCount ? undefined : take,
      skip: !sortByCount && query.cursor ? 1 : undefined,
      cursor: !sortByCount && query.cursor ? { id: query.cursor } : undefined,
      where: {
        AND: [
          searchCondition,
          {
            OR: [
              { ownerId: userId },
              {
                links: { some: { collectionId: { in: memberCollectionIds } } },
              },
            ],
          },
        ],
      },
      include: {
        _count: {
          select: {
            links: { where: { collectionId: { in: accessibleCollectionIds } } },
          },
        },
      },
      orderBy,
    });
    // Prisma cannot sort by a filtered relation count. Sort only authorized counts
    // before applying the cursor; private links never influence the public order.
    let tags = matching;
    if (sortByCount) {
      matching.sort(
        (a, b) =>
          (query.sort === TagSort.LinkCountHighLow ? -1 : 1) *
            (a._count.links - b._count.links) || b.id - a.id
      );
      const cursorIndex = query.cursor
        ? matching.findIndex((tag) => tag.id === query.cursor)
        : -1;
      tags =
        query.cursor && cursorIndex < 0
          ? []
          : matching.slice(cursorIndex + 1, cursorIndex + 1 + take);
    }
    return {
      data: {
        tags,
        nextCursor: tags.length === take ? tags[tags.length - 1].id : null,
      },
      statusCode: 200,
      success: true,
      message: "Success",
    };
  }
  if (collectionId) {
    const linksWhere = { collectionId, collection: { isPublic: true } };
    const tags = await prisma.tag.findMany({
      where: { AND: [searchCondition, { links: { some: linksWhere } }] },
      include: { _count: { select: { links: { where: linksWhere } } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return {
      data: { tags },
      statusCode: 200,
      success: true,
      message: "Success",
    };
  }
  return {
    data: { tags: [] },
    statusCode: 400,
    success: false,
    message: "Please choose a valid user or collection.",
  };
}
