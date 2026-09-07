"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BookCard, BookCardVertical } from "@/components/ui/BookCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingStars } from "@/components/ui/RatingStars";
import { useToast } from "@/components/ui/Toast";
import { AddBook } from "./AddBook";
import {
  SHELVES,
  SHELF_LABEL,
  SHELF_EMPTY_COPY,
  ShelfKey,
} from "@/lib/shelves";
import type { LibraryBook } from "@/lib/book-data";
export function LibraryView({
  initialBooks,
  initialShelves,
}: {
  initialBooks: LibraryBook[];
  initialShelves: { id: string; name: string }[];
}) {
  const [books, setBooks] = useState(initialBooks);
  const [shelves, setShelves] = useState(initialShelves);
  const [shelf, setShelf] = useState<string>("reading_now");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [grid, setGrid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [newShelf, setNewShelf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => setBooks(initialBooks), [initialBooks]);
  useEffect(() => setShelves(initialShelves), [initialShelves]);
  const isDefault = SHELVES.includes(shelf as ShelfKey);
  const shelfBooks = books.filter(
    (b) =>
      shelf === "all" ||
      b.shelf === shelf ||
      b.customShelves.some((s) => s.id === shelf),
  );
  const visible = useMemo(
    () =>
      shelfBooks
        .filter((b) =>
          `${b.title} ${b.author} ${b.isbn13 ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          if (sort === "title") return a.title.localeCompare(b.title);
          if (sort === "author") return a.author.localeCompare(b.author);
          if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
          if (sort === "finished")
            return (b.dateFinished ?? "").localeCompare(a.dateFinished ?? "");
          return b.dateAdded.localeCompare(a.dateAdded);
        }),
    [shelfBooks, query, sort],
  );
  const title =
    shelf === "all"
      ? "All books"
      : isDefault
        ? SHELF_LABEL[shelf as ShelfKey]
        : (shelves.find((s) => s.id === shelf)?.name ?? "Your shelf");
  const book = books.find((b) => b.id === selected);
  function update(book: LibraryBook) {
    setBooks((current) => [book, ...current.filter((b) => b.id !== book.id)]);
  }
  async function save(
    patch: Partial<LibraryBook> & { customShelfIds?: string[] },
  ) {
    if (!book) return;
    const previous = book;
    const { customShelfIds, ...fields } = patch;
    update({
      ...book,
      ...fields,
      ...(customShelfIds
        ? {
            customShelves: shelves.filter((s) => customShelfIds.includes(s.id)),
          }
        : {}),
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/library/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      update(data.book);
      toast("Saved.", "success");
    } catch {
      update(previous);
      toast("That didn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function createShelf(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShelf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setShelves((current) => [
        ...current.filter((s) => s.id !== data.shelf.id),
        data.shelf,
      ]);
      setShelf(data.shelf.id);
      setNewShelf(null);
    } catch {
      toast("That didn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
      <header className="flex flex-wrap gap-4 justify-between items-center mb-8">
        <div>
          <h1 className="font-display text-4xl">Your library</h1>
          <p className="text-ink-500 mt-2">
            The books you keep, and the ones waiting for you.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>+ Add book</Button>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-library gap-8">
        <aside className="min-w-0">
          <h2 className="text-xs text-ink-500 font-medium mb-2">
            Your shelves
          </h2>
          <nav
            className="flex lg:flex-col overflow-x-auto gap-1 pb-2"
            aria-label="Shelves"
          >
            {[
              { id: "all", name: "All books" },
              ...SHELVES.map((id) => ({ id, name: SHELF_LABEL[id] })),
              ...shelves,
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setShelf(s.id);
                  setQuery("");
                }}
                aria-pressed={shelf === s.id}
                className={`flex shrink-0 items-center justify-between gap-3 px-3 py-2 rounded text-sm ${shelf === s.id ? "bg-shelf-100 text-shelf-700 font-medium" : "hover:bg-paper-200"}`}
              >
                <span>{s.name}</span>
                <span className="text-xs text-ink-500 bg-paper-200 px-1.5 rounded-full">
                  {
                    books.filter(
                      (b) =>
                        s.id === "all" ||
                        b.shelf === s.id ||
                        b.customShelves.some((c) => c.id === s.id),
                    ).length
                  }
                </span>
              </button>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={() => setNewShelf("")}>
            + New shelf
          </Button>
          <Link
            href="/settings"
            className="block text-sm text-shelf-700 mt-4 px-3"
          >
            Import your Goodreads library
          </Link>
        </aside>
        <section className="min-w-0">
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <h2 className="font-display text-2xl">
              {title}
              <span className="font-body text-sm text-ink-500 ml-3">
                {shelfBooks.length}
              </span>
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setGrid(!grid)}>
                {grid ? "List view" : "Grid view"}
              </Button>
              <select
                aria-label="Sort books"
                className="bg-paper-50 border border-ink-200 rounded text-sm px-2 py-1.5"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Recently added</option>
                <option value="title">Title A-Z</option>
                <option value="author">Author A-Z</option>
                <option value="rating">Rating</option>
                {shelf === "read" && (
                  <option value="finished">Date read</option>
                )}
              </select>
            </div>
          </div>
          {shelfBooks.length > 0 && (
            <Input
              aria-label="Search your shelf"
              placeholder="Search this shelf"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-4"
            />
          )}
          {visible.length ? (
            <div
              className={
                grid ? "grid grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-2"
              }
            >
              {visible.map((b) => (
                <button
                  className="block w-full text-left rounded focus-visible:outline-shelf-700"
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                >
                  {grid ? <BookCardVertical book={b} /> : <BookCard book={b} />}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              heading={query ? "Try another search" : "Make room for a book"}
              body={
                query
                  ? "Nothing for that search. Try a title, author, or ISBN."
                  : isDefault
                    ? SHELF_EMPTY_COPY[shelf as ShelfKey]
                    : "Add a book, then choose this shelf in its details."
              }
              action={{ label: "Add a book", onClick: () => setAdding(true) }}
            />
          )}
        </section>
      </div>
      {adding && (
        <AddBook
          onClose={() => setAdding(false)}
          defaultShelf={isDefault ? (shelf as ShelfKey) : "tbr"}
          onAdded={(b) => {
            update(b);
            setAdding(false);
            setSelected(b.id);
          }}
        />
      )}
      {book && (
        <Modal
          open
          onClose={() => {
            if (!busy) setSelected(null);
          }}
          title={book.title}
        >
          <div className="space-y-5">
            <BookCard book={book} />
            <label className="block text-sm">
              Shelf
              <select
                className="block w-full border border-ink-200 bg-paper-50 rounded p-2 mt-1"
                disabled={busy}
                value={book.shelf}
                onChange={(e) => save({ shelf: e.target.value as ShelfKey })}
              >
                {SHELVES.map((s) => (
                  <option key={s} value={s}>
                    {SHELF_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <RatingStars
              value={book.rating}
              disabled={busy}
              onChange={(rating) => save({ rating })}
            />
            <label className="block text-sm">
              Private notes
              <Textarea
                key={book.id}
                rows={5}
                maxLength={20000}
                defaultValue={book.privateNotes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (book.privateNotes ?? ""))
                    void save({ privateNotes: e.target.value });
                }}
                className="mt-1"
              />
            </label>
            {shelves.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium mb-2">
                  Also on your shelves
                </legend>
                {shelves.map((s) => (
                  <label key={s.id} className="flex gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={book.customShelves.some((c) => c.id === s.id)}
                      onChange={(e) =>
                        save({
                          customShelfIds: e.target.checked
                            ? [...book.customShelves.map((c) => c.id), s.id]
                            : book.customShelves
                                .filter((c) => c.id !== s.id)
                                .map((c) => c.id),
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </Modal>
      )}
      <Modal
        open={newShelf !== null}
        onClose={() => {
          if (!busy) setNewShelf(null);
        }}
        title="Make a shelf"
      >
        <form onSubmit={createShelf} className="space-y-4">
          <Input
            aria-label="Shelf name"
            placeholder="Favourites, book club, a place to start..."
            maxLength={80}
            required
            value={newShelf ?? ""}
            onChange={(e) => setNewShelf(e.target.value)}
          />
          <p className="text-sm text-ink-500">
            Your custom shelves are private.
          </p>
          <Button type="submit" loading={busy}>
            Create shelf
          </Button>
        </form>
      </Modal>
    </div>
  );
}
