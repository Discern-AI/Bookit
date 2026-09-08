import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeIsbn } from "@/lib/isbn";
import { searchBooks, OpenLibrarySearchResult } from "@/lib/openLibrary";
export async function GET(request: Request) {
  if (!(await auth())?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length > 300)
    return NextResponse.json(
      { error: "Try a shorter search." },
      { status: 400 },
    );
  if (q.length < 2) return NextResponse.json({ results: [] });
  const isbn = normalizeIsbn(q);
  const [local, remote] = await Promise.all([
    prisma.edition.findMany({
      where: {
        OR: [
          ...(isbn ? [{ isbn13: isbn }] : []),
          { work: { title: { contains: q, mode: "insensitive" } } },
          { work: { authorName: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: { work: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    searchBooks(q)
      .then((results) => ({ results, available: true }))
      .catch(() => ({
        results: [] as OpenLibrarySearchResult[],
        available: false,
      })),
  ]);
  const results: OpenLibrarySearchResult[] = local.map((e) => ({
    editionId: e.id,
    format: e.format,
    publisher: e.publisher ?? undefined,
    title: e.work.title,
    author: e.work.authorName,
    isbn13: e.isbn13 ?? undefined,
    year: e.year ?? undefined,
    coverUrl: e.coverUrl ?? undefined,
    pageCount: e.pageCount ?? undefined,
    openLibraryWorkId: e.work.openLibraryId ?? undefined,
  }));
  const keys = new Set(
    results.map(
      (b) => b.isbn13 ?? `${b.title.toLowerCase()}|${b.author.toLowerCase()}`,
    ),
  );
  for (const book of remote.results) {
    const key =
      book.isbn13 ?? `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
    if (!keys.has(key)) {
      keys.add(key);
      results.push(book);
    }
  }
  if (!remote.available && !results.length)
    return NextResponse.json(
      { error: "Book search is unavailable. Try again shortly." },
      { status: 502 },
    );
  return NextResponse.json({
    results: results.slice(0, 24),
    ...(remote.available
      ? {}
      : {
          warning:
            "Showing saved catalogue matches. Open Library is temporarily unavailable.",
        }),
  });
}
