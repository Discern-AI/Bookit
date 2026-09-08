import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { libraryInclude, serializeBook } from "@/lib/book-data";
import { BrowseView } from "@/components/books/BrowseView";
export default async function BrowsePage() {
  const session = await auth();
  if (!session?.user) return null;
  const [current, read, works] = await Promise.all([
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
  ]);
  return (
    <BrowseView
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
