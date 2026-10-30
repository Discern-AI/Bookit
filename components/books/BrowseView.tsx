"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BookCard, BookCardVertical } from "@/components/ui/BookCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AddBook } from "@/components/library/AddBook";
import { LogSession } from "@/components/library/LogSession";
import { PathCard } from "@/components/paths/PathCard";
import type { PathCardData } from "@/lib/path-data";
import type { LibraryBook } from "@/lib/book-data";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
export function BrowseView({
  currentBooks,
  authors,
  catalogue,
  paths,
  followedReleases,
}: {
  paths: PathCardData[];
  currentBooks: LibraryBook[];
  authors: string[];
  catalogue: OpenLibrarySearchResult[];
  followedReleases: { author: string; books: OpenLibrarySearchResult[] }[];
}) {
  const [current, setCurrent] = useState(currentBooks);
  useEffect(() => setCurrent(currentBooks), [currentBooks]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<OpenLibrarySearchResult[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [selected, setSelected] = useState<OpenLibrarySearchResult | null>(
    null,
  );
  const [logging, setLogging] = useState<LibraryBook | null>(null);
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => controller.current?.abort(), []);
  async function search(value: string) {
    const q = value.trim();
    if (q.length < 2) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setQuery(q);
    setSearched(q);
    setLoading(true);
    setError("");
    setWarning("");
    setResults([]);
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`, {
        signal: request.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search is unavailable.");
      if (!request.signal.aborted) {
        setResults(data.results);
        setWarning(data.warning || "");
      }
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "Search is unavailable.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-10">
      <header>
        <h1 className="font-display text-4xl">Browse</h1>
        <p className="text-ink-500 mt-2">
          Find your next book, or return to the one you are reading.
        </p>
      </header>
      {current.some((b) => b.shelf === "reading_now") && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl">Continue reading</h2>
          {current
            .filter((b) => b.shelf === "reading_now")
            .map((b) => (
              <div key={b.id} className="bg-paper-100 rounded-md p-4 space-y-3">
                <Link href={`/library?book=${encodeURIComponent(b.id)}`}>
                  <BookCard book={b} />
                </Link>
                <ProgressBar
                  currentPage={b.currentPage}
                  totalPages={b.pageCount}
                />
                <Button size="sm" onClick={() => setLogging(b)}>
                  Log pages
                </Button>
              </div>
            ))}
        </section>
      )}
      {!!followedReleases.length && (
        <section className="space-y-5" aria-label="Followed author catalogue matches">
          <header>
            <h2 className="font-display text-2xl">Recent work by followed authors</h2>
            <p className="text-sm text-ink-500 mt-1">
              Catalogue matches from Open Library. Availability and release timing are not verified.
            </p>
          </header>
          {followedReleases.map(({ author, books }) => (
            <section key={author} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl">{author}</h3>
                <Link className="text-sm text-shelf-700" href={`/community/authors?author=${encodeURIComponent(author)}`}>
                  Author community
                </Link>
              </div>
              {books.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {books.map((book, i) => (
                    <article key={`${book.openLibraryWorkId ?? book.title}-${i}`} className="space-y-2">
                      <BookCardVertical book={book} />
                      <Button size="sm" variant="secondary" onClick={() => setSelected(book)}>Add to library</Button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">Recent catalogue matches could not be loaded.</p>
              )}
            </section>
          ))}
        </section>
      )}
      <section className="space-y-4">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Reading paths</h2>
          <Link href="/browse/paths" className="text-sm text-shelf-700">
            Explore paths
          </Link>
        </header>
        <p className="text-sm text-ink-500">
          Follow a sequence of books into a subject or author.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {paths.map((path) => (
            <PathCard key={path.id} path={path} />
          ))}
        </div>
        {!paths.length && (
          <p className="text-sm text-ink-500">
            No public paths yet. Yours could be the first.
          </p>
        )}
        <div className="flex gap-4 text-sm text-shelf-700">
          <Link href="/browse/paths/new">Create a path</Link>
          <Link href="/browse/paths?view=mine">Your paths</Link>
          <Link href="/browse/paths?view=following">Following</Link>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-2xl">Find a book</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Input
            aria-label="Title, author, or ISBN"
            placeholder="Title, author, or ISBN"
            minLength={2}
            maxLength={300}
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" disabled={loading || query.trim().length < 2}>
            Search books
          </Button>
        </form>
        {!!authors.length && (
          <div>
            <h3 className="text-sm text-ink-500 mb-2">
              Explore authors you have read
            </h3>
            <div className="flex flex-wrap gap-2">
              {authors.map((a) => (
                <Button
                  key={a}
                  variant="secondary"
                  size="sm"
                  onClick={() => void search(a)}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>
        )}
        {results !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              controller.current?.abort();
              setLoading(false);
              setResults(null);
              setQuery("");
              setError("");
              setWarning("");
            }}
          >
            Clear search
          </Button>
        )}
        {loading && <p role="status">Searching books...</p>}
        {error && (
          <div role="alert">
            <p className="text-rose-700">{error}</p>
            <Button variant="ghost" onClick={() => void search(searched)}>
              Retry search
            </Button>
          </div>
        )}
        {warning && (
          <p role="status" className="text-sm text-ink-500">
            {warning}
          </p>
        )}
        {!loading && !error && results?.length === 0 && (
          <p>No books found. Try another title, author, or ISBN.</p>
        )}
      </section>
      {!loading && !error && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl">
            {results === null
              ? "Explore the catalogue"
              : `Results for ${searched}`}
          </h2>
          {results === null && (
            <p className="text-sm text-ink-500">
              Recently catalogued titles. Search above to explore more books.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {(results ?? catalogue).map((b, i) => (
              <article
                key={`${b.editionId ?? b.isbn13 ?? b.title}-${i}`}
                className="min-w-0 space-y-3"
              >
                {b.workId ? (
                  <Link href={`/book/${b.workId}`} className="block">
                    <BookCardVertical book={b} />
                  </Link>
                ) : (
                  <BookCardVertical book={b} />
                )}
                {b.workId && (
                  <Link
                    href={`/book/${b.workId}`}
                    className="block text-sm text-shelf-700 hover:underline"
                  >
                    View book
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(b)}
                >
                  Add to library
                </Button>
              </article>
            ))}
          </div>
          {results === null && !catalogue.length && (
            <p>
              The catalogue is ready for its first book. Search above to get
              started.
            </p>
          )}
        </section>
      )}
      {selected && (
        <AddBook
          initialBook={selected}
          defaultShelf="tbr"
          onClose={() => setSelected(null)}
          onAdded={(b) => {
            setSelected(null);
            router.push(`/library?book=${encodeURIComponent(b.id)}`);
            router.refresh();
          }}
        />
      )}
      {logging && (
        <Modal open title="Log your reading" onClose={() => setLogging(null)}>
          <LogSession
            book={logging}
            onCancel={() => setLogging(null)}
            onSaved={(b) => {
              setCurrent((items) =>
                items.map((item) => (item.id === b.id ? b : item)),
              );
              setLogging(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
