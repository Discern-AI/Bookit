import type { Prisma } from "@prisma/client";
// Journal/export may include only the reader's own posts in clubs they can still access.
export function ownClubPostsWhere(
  userId: string,
  workId?: string,
): Prisma.BookClubPostWhereInput {
  return {
    userId,
    deletedAt: null,
    reading: {
      ...(workId ? { workId } : {}),
      deletedAt: null,
      club: { deletedAt: null, members: { some: { userId, active: true } } },
    },
  };
}
