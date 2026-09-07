import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeIsbn } from "@/lib/isbn";

export interface ResolvableBook {
  title: string;
  author: string;
  isbn13?: string | null;
  year?: number | null;
  openLibraryWorkId?: string | null;
  coverUrl?: string | null;
  pageCount?: number | null;
  format?: string;
}

export async function findOrCreateEdition(
  book: ResolvableBook,
  db: Prisma.TransactionClient = prisma,
) {
  const isbn13 = normalizeIsbn(book.isbn13);
  if (isbn13) {
    const existing = await db.edition.findUnique({
      where: { isbn13 },
      include: { work: true },
    });
    if (existing) return existing;
  }
  const data = {
    title: book.title.trim(),
    authorName: book.author.trim(),
    genres: [],
    themes: [],
    embedding: [],
  };
  const work = book.openLibraryWorkId
    ? await db.work.upsert({
        where: { openLibraryId: book.openLibraryWorkId },
        update: {},
        create: { ...data, openLibraryId: book.openLibraryWorkId },
      })
    : ((await db.work.findFirst({
        where: {
          title: { equals: data.title, mode: "insensitive" },
          authorName: { equals: data.authorName, mode: "insensitive" },
        },
      })) ?? (await db.work.create({ data })));
  if (!isbn13) {
    const existing = await db.edition.findFirst({
      where: {
        workId: work.id,
        isbn13: null,
        format: book.format ?? "paperback",
      },
      include: { work: true },
    });
    if (existing) return existing;
  }
  const editionData = {
    workId: work.id,
    isbn13,
    year: book.year,
    format: book.format ?? "paperback",
    coverUrl: book.coverUrl,
    pageCount: book.pageCount,
  };
  return isbn13
    ? db.edition.upsert({
        where: { isbn13 },
        update: {},
        create: editionData,
        include: { work: true },
      })
    : db.edition.create({ data: editionData, include: { work: true } });
}
