import { normalizeIsbn } from "@/lib/isbn";
const BASE = process.env.OPEN_LIBRARY_BASE ?? "https://openlibrary.org";
export interface OpenLibrarySearchResult {
  title: string;
  author: string;
  isbn13?: string;
  year?: number;
  coverUrl?: string;
  openLibraryWorkId?: string;
  pageCount?: number;
}
async function get(path: string) {
  const response = await fetch(`${BASE}${path}`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Book search is unavailable. Try again shortly.");
  return response.json();
}
export async function searchBooks(
  query: string,
  limit = 12,
): Promise<OpenLibrarySearchResult[]> {
  if (!query.trim()) return [];
  const isbn = normalizeIsbn(query);
  if (isbn) {
    const book = await lookupByIsbn(isbn);
    if (book) return [book];
  }
  const data = await get(
    `/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,isbn,cover_i,key,number_of_pages_median`,
  );
  return (data.docs ?? []).map(
    (doc: {
      title: string;
      author_name?: string[];
      first_publish_year?: number;
      isbn?: string[];
      cover_i?: number;
      key: string;
      number_of_pages_median?: number;
    }) => ({
      title: doc.title,
      author: doc.author_name?.[0] ?? "Unknown author",
      isbn13: doc.isbn?.map(normalizeIsbn).find(Boolean),
      year: doc.first_publish_year,
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : undefined,
      openLibraryWorkId: doc.key.replace("/works/", ""),
      pageCount: doc.number_of_pages_median,
    }),
  );
}
export async function lookupByIsbn(
  value: string,
): Promise<OpenLibrarySearchResult | null> {
  const isbn = normalizeIsbn(value);
  if (!isbn) return null;
  const data = await get(
    `/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const book = data[`ISBN:${isbn}`];
  if (!book) return null;
  const year = book.publish_date?.match(/\d{4}/)?.[0];
  return {
    title: book.title,
    author:
      book.authors?.map((a: { name: string }) => a.name).join(", ") ??
      "Unknown author",
    isbn13: isbn,
    year: year ? Number(year) : undefined,
    coverUrl: book.cover?.medium,
    pageCount: book.number_of_pages,
  };
}
export function coverUrlForIsbn(isbn: string | null | undefined) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : null;
}
