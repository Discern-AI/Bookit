// Thin client for the Open Library API — Implementation Brief §6.5, §16.1, §16.2.

const BASE = process.env.OPEN_LIBRARY_BASE ?? "https://openlibrary.org";

export interface OpenLibrarySearchResult {
  title: string;
  author: string;
  isbn13?: string;
  year?: number;
  coverId?: number;
  openLibraryWorkId?: string;
}

interface OpenLibrarySearchDoc {
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  key: string; // "/works/OLxxxxW"
}

export async function searchBooks(query: string, limit = 12): Promise<OpenLibrarySearchResult[]> {
  if (!query.trim()) return [];
  const url = `${BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,isbn,cover_i,key`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs: OpenLibrarySearchDoc[] };

  return data.docs.map((doc) => ({
    title: doc.title,
    author: doc.author_name?.[0] ?? "Unknown author",
    isbn13: doc.isbn?.find((i) => i.length === 13) ?? doc.isbn?.[0],
    year: doc.first_publish_year,
    coverId: doc.cover_i,
    openLibraryWorkId: doc.key.replace("/works/", ""),
  }));
}

interface OpenLibraryByIsbnResult {
  title: string;
  authors?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  publishers?: { name: string }[];
  cover?: { medium?: string };
}

export async function lookupByIsbn(isbn: string): Promise<OpenLibrarySearchResult | null> {
  const url = `${BASE}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, OpenLibraryByIsbnResult>;
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  const yearMatch = entry.publish_date?.match(/\d{4}/);
  return {
    title: entry.title,
    author: entry.authors?.[0]?.name ?? "Unknown author",
    isbn13: isbn.length === 13 ? isbn : undefined,
    year: yearMatch ? Number(yearMatch[0]) : undefined,
  };
}

export function coverUrlForIsbn(isbn: string | null | undefined) {
  if (!isbn) return null;
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
}
