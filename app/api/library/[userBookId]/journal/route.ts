import { readingChallenges } from "@/lib/challenge-progress";
import { ownClubPostsWhere } from "@/lib/club-journal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function GET(
  request: Request,
  { params }: { params: { userBookId: string } },
) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const page = Number(new URL(request.url).searchParams.get("page") ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 100000)
    return Response.json({ error: "Invalid page." }, { status: 400 });
  const book = await prisma.userBook.findFirst({
    where: { id: params.userBookId, userId: session.user.id },
    include: { edition: { include: { work: true } } },
  });
  if (!book)
    return Response.json({ error: "Book not found." }, { status: 404 });
  const userId = session.user.id,
    workId = book.edition.workId,
    skip = page * 50;
  const [
    copies,
    entries,
    sessions,
    reviews,
    articles,
    paths,
    gifts,
    clubReadings,
    clubPosts,
  ] = await Promise.all([
    prisma.userBook.findMany({
      where: { userId, edition: { workId } },
      select: {
        id: true,
        privateNotes: true,
        importedReview: true,
        readingCycles: {
          where: { cancelledAt: null },
          orderBy: { number: "asc" },
        },
        edition: { select: { format: true } },
      },
    }),
    prisma.bookEntry.findMany({
      where: { userId, workId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: 51,
    }),
    prisma.readingSession.findMany({
      where: { userId, deletedAt: null, userBook: { edition: { workId } } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip,
      take: 51,
    }),
    prisma.bookReview.findMany({
      where: { userId, workId, deletedAt: null },
      select: {
        id: true,
        body: true,
        isPublic: true,
        isHidden: true,
        updatedAt: true,
      },
    }),
    prisma.$queryRaw<
      {
        id: string;
        title: string;
        isPublic: boolean;
        isHidden: boolean;
        updatedAt: Date;
      }[]
    >`
   SELECT a."id", a."title", a."isPublic", a."isHidden", a."updatedAt" FROM "Article" a
   WHERE a."userId" = ${userId} AND a."deletedAt" IS NULL AND (
    jsonb_path_exists(a."content", '$.** ? (@.type == "bookCard" && @.attrs.workId == $work)', jsonb_build_object('work', ${workId}::text))
    OR jsonb_path_exists(a."publishedContent", '$.** ? (@.type == "bookCard" && @.attrs.workId == $work)', jsonb_build_object('work', ${workId}::text))
    OR a."sourceReviewId" IN (SELECT "id" FROM "BookReview" WHERE "userId" = ${userId} AND "workId" = ${workId}))
   ORDER BY a."updatedAt" DESC, a."id" DESC LIMIT 51 OFFSET ${skip}`,
    prisma.readingPath.findMany({
      where: { userId, entries: { some: { workId } } },
      select: { id: true, title: true },
      skip,
      take: 51,
    }),
    prisma.giftContact.findMany({
      where: { userId, giftItems: { some: { workId } } },
      select: { id: true, name: true },
      skip,
      take: 51,
    }),
    prisma.bookClubReading.findMany({
      where: {
        workId,
        deletedAt: null,
        club: { deletedAt: null, members: { some: { userId, active: true } } },
      },
      select: {
        id: true,
        startsOn: true,
        endsOn: true,
        club: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: 51,
    }),
    prisma.bookClubPost.findMany({
      where: ownClubPostsWhere(userId, workId),
      select: {
        id: true,
        body: true,
        spoilerPage: true,
        createdAt: true,
        reading: {
          select: { id: true, club: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: 51,
    }),
  ]);
  const challenges = (await readingChallenges(userId))
    .filter((c) => c.completions.some((r) => r.workId === workId))
    .map((c) => ({
      id: c.id,
      title: c.title,
      count: c.completions.length,
      target: c.target,
    }));
  return Response.json(
    {
      challenges,
      book: {
        id: book.id,
        workId,
        title: book.edition.work.title,
        author: book.edition.work.authorName,
        coverUrl: book.edition.coverUrl,
      },
      copies,
      entries: entries.slice(0, 50),
      sessions: sessions.slice(0, 50),
      reviews,
      articles: articles.slice(0, 50),
      paths: paths.slice(0, 50),
      gifts: gifts.slice(0, 50),
      clubReadings: clubReadings.slice(0, 50),
      clubPosts: clubPosts.slice(0, 50),
      hasMore: [
        entries,
        sessions,
        articles,
        paths,
        gifts,
        clubReadings,
        clubPosts,
      ].some((a) => a.length > 50),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
