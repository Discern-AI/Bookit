import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { libraryInclude, serializeBook } from "@/lib/book-data";
import { LibraryView } from "@/components/library/LibraryView";
export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [books, shelves] = await Promise.all([
    prisma.userBook.findMany({
      where: { userId: session.user.id },
      include: libraryInclude,
      orderBy: { dateAdded: "desc" },
    }),
    prisma.customShelf.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <LibraryView
      initialBooks={books.map(serializeBook)}
      initialShelves={shelves}
    />
  );
}
