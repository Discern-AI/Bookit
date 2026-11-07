import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MarketplaceFilters = {
  q?: string;
  tier?: string;
  kind?: string;
  scope?: string;
  cursor?: string;
};

function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const updatedAt = new Date(parsed.updatedAt);
    return typeof parsed.id === "string" && !Number.isNaN(updatedAt.getTime())
      ? { updatedAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

export async function marketplacePage(
  userId: string,
  filters: MarketplaceFilters,
) {
  const cursor = decodeCursor(filters.cursor);
  const visibility: Prisma.MarketplaceListingWhereInput =
    filters.scope === "mine"
      ? { userId }
      : filters.scope === "saved"
        ? { isPublished: true, saves: { some: { userId } } }
        : { OR: [{ isPublished: true }, { userId }] };
  const where: Prisma.MarketplaceListingWhereInput = {
    deletedAt: null,
    AND: [
      visibility,
      ...(filters.q
        ? [
            {
              OR: [
                {
                  title: {
                    contains: filters.q,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  description: {
                    contains: filters.q,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  makeDoAlternative: {
                    contains: filters.q,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  work: {
                    is: {
                      title: {
                        contains: filters.q,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  },
                },
                {
                  work: {
                    is: {
                      authorName: {
                        contains: filters.q,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(filters.tier ? [{ budgetTier: filters.tier }] : []),
      ...(filters.kind ? [{ kind: filters.kind }] : []),
      ...(cursor
        ? [
            {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
              ],
            },
          ]
        : []),
    ],
  };
  const rows = await prisma.marketplaceListing.findMany({
    where,
    include: {
      work: { select: { id: true, title: true, authorName: true } },
      saves: { where: { userId }, select: { userId: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 21,
  });
  const hasMore = rows.length > 20;
  const page = rows.slice(0, 20);
  return {
    listings: page.map(({ saves, userId: ownerId, ...item }) => ({
      ...item,
      isSaved: saves.length > 0,
      isOwner: ownerId === userId,
    })),
    nextCursor:
      hasMore && page.length
        ? Buffer.from(
            JSON.stringify({
              updatedAt: page.at(-1)!.updatedAt.toISOString(),
              id: page.at(-1)!.id,
            }),
          ).toString("base64url")
        : null,
  };
}
