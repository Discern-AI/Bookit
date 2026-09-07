import { prisma } from "@/lib/prisma";

export interface ResolvableBook {
  title: string;
  author: string;
  isbn13?: string | null;
  year?: number | null;
  openLibraryWorkId?: string | null;
}

// Resolves a search/import result to a canonical Edition, creating the
// Work/Edition rows if they don't exist yet. Priority for matching an
// existing record: ISBN, then Open Library work id, then title+author.
export async function findOrCreateEdition(book: ResolvableBook) {
  if (book.isbn13) {
    const existing = await prisma.edition.findUnique({
      where: { isbn13: book.isbn13 },
      include: { work: true },
    });
    if (existing) return existing;
  }

  let work = book.openLibraryWorkId
    ? await prisma.work.findUnique({ where: { openLibraryId: book.openLibraryWorkId } })
    : await prisma.work.findFirst({ where: { title: book.title, authorName: book.author } });

  if (!work) {
    work = await prisma.work.create({
      data: {
        title: book.title,
        authorName: book.author,
        openLibraryId: book.openLibraryWorkId ?? undefined,
        genres: [],
        themes: [],
        embedding: [],
      },
    });
  }

  const edition = await prisma.edition.create({
    data: {
      workId: work.id,
      isbn13: book.isbn13 ?? undefined,
      year: book.year ?? undefined,
      format: "paperback",
    },
    include: { work: true },
  });

  return edition;
}
