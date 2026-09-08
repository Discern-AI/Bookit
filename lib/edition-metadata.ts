import { normalizeIsbn } from "./isbn";
export interface RemoteEdition {
  openLibraryId: string;
  workIds: string[];
  title: string;
  isbn13: string | null;
  isbns: string[];
  publisher: string | null;
  year: number | null;
  pageCount: number | null;
  format: string;
  languages: string[];
  translators: string[];
  coverUrl: string | null;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter(
          (s): s is string =>
            typeof s === "string" && s.trim().length > 0 && s.length <= 500,
        )
        .slice(0, 100)
        .map((s) => s.trim())
    : [];
}
export function languageName(code: string): string {
  return (
    (
      {
        eng: "English",
        fre: "French",
        fra: "French",
        ger: "German",
        deu: "German",
        spa: "Spanish",
        ita: "Italian",
        por: "Portuguese",
        rus: "Russian",
        jpn: "Japanese",
        chi: "Chinese",
        zho: "Chinese",
        ara: "Arabic",
        lat: "Latin",
      } as Record<string, string>
    )[code] ?? code
  );
}
export function parseEdition(value: unknown): RemoteEdition | null {
  const data = record(value);
  const key =
    typeof data.key === "string"
      ? data.key.match(/^\/books\/(OL\d+M)$/)?.[1]
      : null;
  if (
    !key ||
    typeof data.title !== "string" ||
    !data.title.trim() ||
    data.title.length > 500
  )
    return null;
  const references = (v: unknown, regex: RegExp) =>
    Array.isArray(v)
      ? v.slice(0, 100).flatMap((item) => {
          const key = record(item).key;
          const match = typeof key === "string" ? key.match(regex)?.[1] : null;
          return match ? [match] : [];
        })
      : [];
  const isbns = Array.from(
    new Set(
      [...strings(data.isbn_13), ...strings(data.isbn_10)]
        .map(normalizeIsbn)
        .filter((s): s is string => !!s),
    ),
  );
  const rawFormat =
    typeof data.physical_format === "string"
      ? data.physical_format.trim().toLowerCase()
      : "";
  const format = /^(hardcover|hardback|library binding)$/.test(rawFormat)
    ? "hardback"
    : /^(paperback|mass market paperback|softcover)$/.test(rawFormat)
      ? "paperback"
      : /^(ebook|e-book|electronic resource)$/.test(rawFormat)
        ? "ebook"
        : /^(audio cd|audio cassette|audiobook)$/.test(rawFormat)
          ? "audiobook"
          : rawFormat === "large print"
            ? "large_print"
            : "unknown";
  const yearMatch =
    typeof data.publish_date === "string"
      ? data.publish_date.match(/\b(\d{4})\b/)?.[1]
      : null;
  const year =
    yearMatch && Number(yearMatch) > 0 && Number(yearMatch) <= 3000
      ? Number(yearMatch)
      : null;
  const translators = Array.isArray(data.contributors)
    ? data.contributors.slice(0, 100).flatMap((item) => {
        const c = record(item);
        return typeof c.role === "string" &&
          /^(translator|translation|translated by)$/i.test(c.role.trim()) &&
          typeof c.name === "string" &&
          c.name.trim() &&
          c.name.length <= 500
          ? [c.name.trim()]
          : [];
      })
    : [];
  const cover = Array.isArray(data.covers)
    ? data.covers.find(
        (c) => typeof c === "number" && Number.isSafeInteger(c) && c > 0,
      )
    : null;
  return {
    openLibraryId: key,
    workIds: Array.from(new Set(references(data.works, /^\/works\/(OL\d+W)$/))),
    title: data.title.trim(),
    isbn13: isbns[0] ?? null,
    isbns,
    publisher: strings(data.publishers).join("; ") || null,
    year,
    pageCount:
      typeof data.number_of_pages === "number" &&
      Number.isInteger(data.number_of_pages) &&
      data.number_of_pages > 0 &&
      data.number_of_pages <= 100000
        ? data.number_of_pages
        : null,
    format,
    languages: Array.from(
      new Set(references(data.languages, /^\/languages\/([a-z]{3})$/)),
    ),
    translators: Array.from(new Set(translators)),
    coverUrl: cover
      ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg`
      : null,
  };
}
