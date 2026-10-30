import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { libraryInclude, serializeBook } from "@/lib/book-data";
import { pathCardSelect } from "@/lib/path-data";
import { BrowseView } from "@/components/books/BrowseView";
import { searchAuthorWorks } from "@/lib/openLibrary";
export default async function BrowsePage() {
  const session = await auth();
  if (!session?.user) return null;
  const [current, read, works, paths, follows] = await Promise.all([
    prisma.userBook.findMany({
      where: { userId: session.user.id, shelf: "reading_now" },
      include: libraryInclude,
      orderBy: { dateAdded: "desc" },
      take: 12,
    }),
    prisma.userBook.findMany({
      where: { userId: session.user.id, shelf: "read" },
      select: {
        edition: { select: { work: { select: { authorName: true } } } },
      },
      orderBy: { dateFinished: "desc" },
      take: 50,
    }),
    prisma.work.findMany({
      where: { editions: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        title: true,
        authorName: true,
        editions: {
          take: 1,
          orderBy: [{ year: "desc" }, { id: "asc" }],
          select: {
            id: true,
            isbn13: true,
            year: true,
            coverUrl: true,
            pageCount: true,
            format: true,
          },
        },
      },
    }),
    prisma.readingPath.findMany({
      where: { isPublic: true },
      select: pathCardSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 6,
    }),
    prisma.followedAuthor.findMany({
      where: { userId: session.user.id },
      orderBy: [{ createdAt: "desc" }, { authorKey: "asc" }],
      take: 4,
    }),
  ]);
  const followedReleases = (
    await Promise.all(
      follows.map(async (follow) => {
        try {
          return {
            author: follow.displayName,
            books: await searchAuthorWorks(follow.displayName, 4),
          };
        } catch {
          return { author: follow.displayName, books: [] as never[] };
        }
      }),
    )
  );
  return (
    <BrowseView
      paths={paths}
      followedReleases={followedReleases}
      currentBooks={current.map(serializeBook)}
      authors={Array.from(
        new Set(read.map((b) => b.edition.work.authorName)),
      ).slice(0, 8)}
      catalogue={works.flatMap((w) =>
        w.editions.map((e) => ({
          workId: w.id,
          editionId: e.id,
          title: w.title,
          author: w.authorName,
          isbn13: e.isbn13 ?? undefined,
          year: e.year ?? undefined,
          coverUrl: e.coverUrl ?? undefined,
          pageCount: e.pageCount ?? undefined,
          format: e.format,
        })),
      )}
    />
  );
}
