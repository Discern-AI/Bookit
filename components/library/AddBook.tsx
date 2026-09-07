"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BookCard, BookCardVertical } from "@/components/ui/BookCard";
import { useToast } from "@/components/ui/Toast";
import { SHELVES, SHELF_LABEL, ShelfKey } from "@/lib/shelves";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
import type { LibraryBook } from "@/lib/book-data";
export function AddBook({
  onClose,
  onAdded,
  defaultShelf,
}: {
  onClose: () => void;
  onAdded: (book: LibraryBook) => void;
  defaultShelf: ShelfKey;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenLibrarySearchResult[]>([]);
  const [selected, setSelected] = useState<OpenLibrarySearchResult | null>(
    null,
  );
  const [shelf, setShelf] = useState(defaultShelf);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    setResults([]);
    setError("");
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/books/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search is unavailable.");
        setResults(data.results);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Search is unavailable.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  async function add() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/library/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selected, shelf }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "That didn't save. Try again.");
      toast(
        data.duplicate
          ? "This edition is already in your library."
          : `Added to ${SHELF_LABEL[shelf].toLowerCase()}.`,
        "success",
      );
      onAdded(data.book);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={selected ? "Add to your library" : "Find a book"}
    >
      {selected ? (
        <div className="space-y-5">
          <BookCard book={selected} />
          <fieldset>
            <legend className="text-sm font-medium mb-2">Choose a shelf</legend>
            <div className="grid grid-cols-2 gap-2">
              {SHELVES.map((s) => (
                <label key={s} className="flex gap-2 text-sm items-center">
                  <input
                    type="radio"
                    name="shelf"
                    checked={shelf === s}
                    onChange={() => setShelf(s)}
                  />
                  {SHELF_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button loading={saving} onClick={add}>
              Add to library
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setSelected(null)}
            >
              Back to search
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="sr-only" htmlFor="book-search">
            Title, author, or ISBN
          </label>
          <Input
            id="book-search"
            autoFocus
            placeholder="Title, author, or ISBN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? (
            <div role="status" className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-56 bg-ink-200 rounded animate-pulse"
                />
              ))}
              <span className="sr-only">Searching books</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {results.map((book, i) => (
                <button
                  type="button"
                  className="text-left rounded focus-visible:outline-shelf-700"
                  key={`${book.isbn13 ?? book.title}-${i}`}
                  onClick={() => setSelected(book)}
                >
                  <BookCardVertical book={book} />
                </button>
              ))}
            </div>
          )}
          {!searching &&
            query.trim().length >= 2 &&
            !results.length &&
            !error && (
              <p className="text-ink-500">
                Nothing for that search. Try a title, author, or ISBN.
              </p>
            )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-rose-600 text-sm mt-4">
          {error}
        </p>
      )}
    </Modal>
  );
}
