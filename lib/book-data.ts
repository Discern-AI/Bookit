import type { Prisma } from "@prisma/client";
import type { ShelfKey } from "@/lib/shelves";

export const libraryInclude = {
  edition: { include: { work: true, translation: true } },
  customShelves: true,
  readingSessions: {
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1,
  },
} satisfies Prisma.UserBookInclude;
export type StoredBook = Prisma.UserBookGetPayload<{
  include: typeof libraryInclude;
}>;
export interface LibraryBook {
  workId?: string;
  currentPage: number;
  lastSessionId: string | null;
  id: string;
  title: string;
  author: string;
  shelf: ShelfKey;
  isbn13: string | null;
  coverUrl: string | null;
  year: number | null;
  pageCount: number | null;
  publisher?: string | null;
  language?: string | null;
  description?: string | null;
  genres?: string[];
  format: string;
  rating: number | null;
  dateAdded: string;
  dateFinished: string | null;
  privateNotes: string | null;
  customShelves: { id: string; name: string }[];
}
export function serializeBook(book: StoredBook): LibraryBook {
  return {
    workId: book.edition.workId,
    currentPage: book.readingSessions[0]?.pageEnd ?? 0,
    lastSessionId: book.readingSessions[0]?.id ?? null,
    id: book.id,
    title: book.edition.work.title,
    author: book.edition.work.authorName,
    shelf: book.shelf,
    isbn13: book.edition.isbn13,
    coverUrl: book.edition.coverUrl,
    year: book.edition.year,
    pageCount: book.edition.pageCount,
    publisher: book.edition.publisher,
    language: book.edition.translation?.language ?? null,
    description: book.edition.work.description,
    genres: book.edition.work.genres,
    format: book.edition.format,
    rating: book.rating,
    dateAdded: book.dateAdded.toISOString(),
    dateFinished: book.dateFinished?.toISOString() ?? null,
    privateNotes: book.privateNotes,
    customShelves: book.customShelves.map(({ id, name }) => ({ id, name })),
  };
}
