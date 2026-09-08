"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { LibraryBook } from "@/lib/book-data";
type Edition = {
  id: string;
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
          <h3 className="font-medium capitalize">
            {e.format.replaceAll("_", " ")}
            {e.current ? " - This edition" : ""}
          </h3>
          <p className="text-sm">
            {[
              e.publisher,
              e.year,
              e.language,
              e.pageCount ? `${e.pageCount} pages` : null,
            ]
              .filter(Boolean)
              .join(" / ") || "Publication details unavailable"}
          </p>
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
      <p className="text-xs text-ink-500">
        Search by ISBN for an exact edition. Language is shown only where it is
        recorded; translator information is not yet available.
      </p>
    </section>
  );
}
