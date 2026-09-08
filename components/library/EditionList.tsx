"use client";
import { useEffect, useState } from "react";
import { RemoteEditions } from "@/components/books/RemoteEditions";
import { languageName } from "@/lib/edition-metadata";
import { Button } from "@/components/ui/Button";
import type { LibraryBook } from "@/lib/book-data";
type Edition = {
  id: string;
  editionTitle: string | null;
  openLibraryId: string | null;
  languages: string[];
  translators: string[];
  current: boolean;
  userBookId: string | null;
  publisher: string | null;
  year: number | null;
  format: string;
  language: string | null;
  pageCount: number | null;
  isbn13: string | null;
};
export function EditionList({
  book,
  onAdded,
  onFind,
}: {
  book: LibraryBook;
  onAdded: (book: LibraryBook) => void;
  onFind: () => void;
}) {
  const [editions, setEditions] = useState<Edition[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setEditions(null);
    setError("");
    fetch(`/api/library/${book.id}/editions`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Editions could not load.");
        const data = await res.json();
        setEditions(data.editions);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [book.id, attempt]);
  async function add(edition: Edition) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/library/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId: edition.id,
          title: book.title,
          author: book.author,
          shelf: "tbr",
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "That edition could not be added.");
      onAdded(data.book);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <p className="text-sm text-ink-500">
        Editions currently in the catalogue. Another edition is added as a
        separate copy on your Want to read shelf, keeping your current notes and
        reading history with this copy.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}{" "}
          <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      )}
      {!editions && !error && <p role="status">Loading editions...</p>}
      {editions?.map((e) => (
        <article
          key={e.id}
          className="rounded border border-ink-200 p-4 space-y-2"
        >
          {e.editionTitle && <p className="font-medium">{e.editionTitle}</p>}
          <h3 className="font-medium capitalize">
            {e.format.replaceAll("_", " ")}
            {e.current ? " - This edition" : ""}
          </h3>
          <p className="text-sm">
            {[
              e.publisher,
              e.year,
              e.languages.length
                ? e.languages.map(languageName).join(", ")
                : e.language,
              e.pageCount ? `${e.pageCount} pages` : null,
            ]
              .filter(Boolean)
              .join(" / ") || "Publication details unavailable"}
          </p>
          {!!e.translators.length && (
            <p className="text-sm">Translated by {e.translators.join(", ")}</p>
          )}
          {e.openLibraryId && (
            <a
              href={`https://openlibrary.org/books/${e.openLibraryId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-shelf-700 underline"
            >
              Source: Open Library
            </a>
          )}
          {e.isbn13 && <p className="text-xs text-ink-500">ISBN {e.isbn13}</p>}
          {!e.current && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => add(e)}
            >
              {e.userBookId ? "Open your copy" : "Add this edition"}
            </Button>
          )}
        </article>
      ))}
      <Button variant="secondary" onClick={onFind} disabled={busy}>
        Find another edition
      </Button>
      {book.workId && <RemoteEditions workId={book.workId} onAdded={onAdded} />}
      <p className="text-xs text-ink-500">
        Languages and translator credits are shown only where recorded in the
        source.
      </p>
    </section>
  );
}
