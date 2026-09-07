import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LibraryView } from "@/components/library/LibraryView";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) return null;

  const userBooks = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: { edition: { include: { work: true } } },
    orderBy: { dateAdded: "desc" },
  });

  const serialized = userBooks.map((ub) => ({
    id: ub.id,
    shelf: ub.shelf,
    rating: ub.rating,
    dateAdded: ub.dateAdded.toISOString(),
    title: ub.edition.work.title,
    author: ub.edition.work.authorName,
    isbn13: ub.edition.isbn13,
    coverUrl: ub.edition.coverUrl,
    year: ub.edition.year,
    pageCount: ub.edition.pageCount,
    format: ub.edition.format,
  }));

  return <LibraryView initialBooks={serialized} />;
}
