import { normalizeIsbn } from "./isbn";
import type { ShelfKey } from "./shelves";
export interface ImportRow {
  title: string;
  author: string;
  isbn13?: string;
  year?: number;
  pageCount?: number;
  shelf: ShelfKey;
  rating: number | null;
  dateAdded: string | null;
  dateFinished: string | null;
  importedReview: string;
  privateNotes: string;
  customShelves: string[];
}
// RFC 4180 fields, including escaped quotes, embedded commas and multiline reviews.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"') {
      if (field || closed)
        throw new Error("A CSV field has an unexpected quote.");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed && c.trim())
        throw new Error("A CSV field has text after its closing quote.");
      if (!closed) field += c;
    }
  }
  if (quoted)
    throw new Error(
      "The CSV ends inside a quoted field. Export it again from Goodreads.",
    );
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function date(value: string): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${iso}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso)
    ? parsed.toISOString()
    : null;
}
export function parseGoodreads(text: string): {
  rows: ImportRow[];
  errors: string[];
} {
  const [header, ...records] = parseCsv(text);
  if (
    !header ||
    !["Title", "Author", "Exclusive Shelf"].every((h) => header.includes(h))
  )
    throw new Error(
      "Choose a Goodreads export with Title, Author, and Exclusive Shelf columns.",
    );
  if (records.length > 10000)
    throw new Error("Import up to 10,000 books at a time.");
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  for (const [index, record] of records.entries()) {
    const get = (name: string) => (record[header.indexOf(name)] ?? "").trim();
    if (!get("Title") || !get("Author") || record.length !== header.length) {
      errors.push(
        `Row ${index + 2}: missing title/author or mismatched columns.`,
      );
      continue;
    }
    const sourceShelf = get("Exclusive Shelf");
    const shelf: ShelfKey =
      sourceShelf === "read"
        ? "read"
        : sourceShelf === "currently-reading"
          ? "reading_now"
          : "tbr";
    const rating = Number(get("My Rating"));
    const year = Number(get("Year Published"));
    const pages = Number(get("Number of Pages"));
    const customShelves = get("Bookshelves")
      .split(",")
      .map((s) => s.trim())
      .filter(
        (s) => s && !["read", "currently-reading", "to-read"].includes(s),
      );
    if (
      sourceShelf &&
      !["read", "currently-reading", "to-read"].includes(sourceShelf)
    )
      customShelves.push(sourceShelf);
    rows.push({
      title: get("Title").slice(0, 500),
      author: get("Author").slice(0, 500),
      isbn13: normalizeIsbn(get("ISBN13")) ?? normalizeIsbn(get("ISBN")),
      year: year > 0 && year < 3000 ? Math.trunc(year) : undefined,
      pageCount: pages > 0 && pages < 100000 ? Math.trunc(pages) : undefined,
      shelf,
      rating: rating > 0 && rating <= 5 ? rating : null,
      dateAdded: date(get("Date Added")),
      dateFinished: date(get("Date Read")),
      importedReview: get("My Review"),
      privateNotes: get("Private Notes"),
      customShelves: Array.from(
        new Set(customShelves.map((s) => s.slice(0, 80))),
      ),
    });
  }
  if (!rows.length)
    throw new Error("There aren't any valid book rows in this file.");
  return { rows, errors };
}
