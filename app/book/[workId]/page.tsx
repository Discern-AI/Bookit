import { ReviewList, reviewPage } from "@/components/community/ReviewList";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BookCardVertical } from "@/components/ui/BookCard";
import { GetBook } from "@/components/books/GetBook";
import { pathCardSelect } from "@/lib/path-data";
import { PathCard } from "@/components/paths/PathCard";
import { RemoteEditions } from "@/components/books/RemoteEditions";
import { languageName } from "@/lib/edition-metadata";
import { AddEdition } from "@/components/books/AddEdition";
export const dynamic = "force-dynamic";
const getWork = cache((id: string) =>
  prisma.work.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      authorName: true,
      description: true,
      genres: true,
      editions: {
        orderBy: [{ year: "desc" }, { id: "asc" }],
        select: {
          id: true,
          editionTitle: true,
          openLibraryId: true,
          languages: true,
          translators: true,
          isbn13: true,
          publisher: true,
          year: true,
          pageCount: true,
          format: true,
          coverUrl: true,
          translation: { select: { language: true } },
        },
      },
    },
  }),
);
export async function generateMetadata({
  params,
}: {
  params: { workId: string };
}): Promise<Metadata> {
  const work = await getWork(params.workId);
  return {
    title: work
      ? `${work.title} by ${work.authorName} | Folio`
      : "Book not found | Folio",
    description: work
      ? `Explore editions of ${work.title} by ${work.authorName}.`
      : undefined,
  };
}
export default async function BookPage({
  params,
  searchParams,
}: {
  params: { workId: string };
  searchParams: { page?: string };
}) {
  const [work, session] = await Promise.all([getWork(params.workId), auth()]);
  if (!work) notFound();
  const first = work.editions[0];
  const paths = await prisma.readingPath.findMany({
    where: { isPublic: true, entries: { some: { workId: work.id } } },
    select: pathCardSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 6,
  });
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <Link
        className="underline"
        href={`/community/discussions?work=${work.id}`}
      >
        Discuss this book
      </Link>
      <p>
        <Link
          className="underline"
          href={`/community/authors?author=${encodeURIComponent(work.authorName)}`}
        >
          Explore the author community
        </Link>
      </p>
      <nav
        aria-label="Book navigation"
        className="flex justify-between text-shelf-700"
      >
        <Link href={session?.user ? "/browse" : "/login"}>Folio</Link>
        <Link href={session?.user ? "/library" : "/login"}>
          {session?.user ? "Your library" : "Sign in"}
        </Link>
      </nav>
      <header className="flex flex-col sm:flex-row gap-8">
        {first && (
          <BookCardVertical
            book={{
              title: work.title,
              author: work.authorName,
              coverUrl: first.coverUrl,
              isbn13: first.isbn13,
            }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className="font-display text-4xl break-words">{work.title}</h1>
          <p className="text-xl text-ink-500">{work.authorName}</p>
          <div className="flex flex-wrap gap-2">
            {work.genres.map((g) => (
              <span
                key={g}
                className="text-xs bg-paper-200 rounded-full px-2 py-1"
              >
                {g}
              </span>
            ))}
          </div>
          <GetBook title={work.title} author={work.authorName} workId={work.id} />
        </div>
      </header>
      <section className="space-y-3">
        <h2 className="font-display text-2xl">About this book</h2>
        <p className="whitespace-pre-wrap">
          {work.description ||
            "A description has not been added to the catalogue yet."}
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-2xl">Editions &amp; translations</h2>
        <p className="text-sm text-ink-500">
          Editions recorded in the catalogue. Choose the copy you want to keep
          in your library.
        </p>
        {!work.editions.length && <p>No editions recorded yet.</p>}
        {work.editions.map((e) => (
          <article key={e.id} className="bg-paper-100 rounded-md p-5 space-y-3">
            {e.editionTitle && <p className="font-medium">{e.editionTitle}</p>}
            <h3 className="font-medium capitalize">
              {e.format.replaceAll("_", " ")}
            </h3>
            <p className="text-sm">
              {[
                e.publisher,
                e.year,
                e.languages.length
                  ? e.languages.map(languageName).join(", ")
                  : e.translation?.language,
                e.pageCount ? `${e.pageCount} pages` : null,
              ]
                .filter(Boolean)
                .join(" / ") || "Publication details unavailable"}
            </p>
            {!!e.translators.length && (
              <p className="text-sm">
                Translated by {e.translators.join(", ")}
              </p>
            )}
            {e.openLibraryId && (
              <a
                href={`https://openlibrary.org/books/${e.openLibraryId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-shelf-700 underline"
              >
                Source: Open Library
              </a>
            )}
            {e.isbn13 && (
              <p className="text-xs text-ink-500">ISBN {e.isbn13}</p>
            )}
            {session?.user ? (
              <AddEdition
                book={{
                  editionId: e.id,
                  title: e.editionTitle ?? work.title,
                  author: work.authorName,
                  format: e.format,
                  year: e.year ?? undefined,
                  coverUrl: e.coverUrl ?? undefined,
                  isbn13: e.isbn13 ?? undefined,
                  pageCount: e.pageCount ?? undefined,
                }}
              />
            ) : (
              <Link href="/login" className="text-shelf-700 hover:underline">
                Sign in to add to your library
              </Link>
            )}
            <GetBook
              title={work.title}
              author={work.authorName}
              isbn13={e.isbn13}
              workId={work.id}
            />
          </article>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-2xl">Community reviews</h2>
        {session?.user && (
          <Link className="underline" href={`/community/review/${work.id}`}>
            Write or edit your review (library books)
          </Link>
        )}
        <ReviewList
          workId={work.id}
          page={reviewPage(searchParams.page)}
          basePath={`/book/${work.id}`}
        />
      </section>
      {session?.user && <RemoteEditions workId={work.id} />}
      {!!paths.length && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl">
            Reading paths with this book
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paths.map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
