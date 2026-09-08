import { parseEdition } from "@/lib/edition-metadata";
export class EditionProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
async function get(path: string) {
  try {
    const response = await fetch(
      `${process.env.OPEN_LIBRARY_BASE ?? "https://openlibrary.org"}${path}`,
      {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Folio/0.1 (reading catalogue)",
        },
      },
    );
    if (!response.ok)
      throw new EditionProviderError(
        response.status === 404
          ? "Open Library has no matching edition record."
          : "Open Library is unavailable. Please try again.",
      );
    return await response.json();
  } catch (e) {
    if (e instanceof EditionProviderError) throw e;
    throw new EditionProviderError(
      "Open Library could not be reached. Your saved editions are still available.",
    );
  }
}
export async function sourceWork(work: {
  openLibraryId: string | null;
  editions: { isbn13: string | null }[];
}) {
  if (work.openLibraryId && /^OL\d+W$/.test(work.openLibraryId))
    return work.openLibraryId;
  const isbn = work.editions.find((e) => e.isbn13)?.isbn13;
  if (!isbn)
    throw new EditionProviderError(
      "This work has no Open Library link or ISBN to match. Find an exact ISBN through catalogue search first.",
      422,
    );
  const edition = parseEdition(
    await get(`/isbn/${encodeURIComponent(isbn)}.json`),
  );
  if (!edition || !edition.isbns.includes(isbn) || edition.workIds.length !== 1)
    throw new EditionProviderError(
      "The ISBN does not identify one clear Open Library work. No metadata has been changed.",
      409,
    );
  return edition.workIds[0];
}
export async function remoteEdition(id: string) {
  if (!/^OL\d+M$/.test(id))
    throw new EditionProviderError("Invalid edition identifier.", 400);
  const edition = parseEdition(await get(`/books/${id}.json`));
  if (!edition || edition.openLibraryId !== id)
    throw new EditionProviderError(
      "Open Library returned an unrecognised edition record.",
    );
  return edition;
}
export async function remoteEditions(workId: string, offset: number) {
  if (!/^OL\d+W$/.test(workId))
    throw new EditionProviderError("Invalid work identifier.", 400);
  const data = await get(
    `/works/${workId}/editions.json?limit=20&offset=${offset}`,
  );
  if (!data || !Array.isArray(data.entries))
    throw new EditionProviderError(
      "Open Library returned an unrecognised edition list.",
    );
  const editions = data.entries
    .slice(0, 20)
    .map(parseEdition)
    .filter(
      (
        e: ReturnType<typeof parseEdition>,
      ): e is NonNullable<ReturnType<typeof parseEdition>> =>
        !!e && e.workIds.length === 1 && e.workIds[0] === workId,
    );
  const nextOffset =
    data.entries.length >= 20 &&
    offset + 20 < 10000 &&
    (typeof data.size !== "number" || offset + 20 < data.size)
      ? offset + 20
      : null;
  return { editions, nextOffset };
}
