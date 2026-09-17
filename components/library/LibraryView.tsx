"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BookCard, BookCardVertical } from "@/components/ui/BookCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingStars } from "@/components/ui/RatingStars";
import { useToast } from "@/components/ui/Toast";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StartReread } from "./StartReread";
import { LogSession } from "./LogSession";
import { SessionHistory } from "./SessionHistory";
import { ManageShelf } from "./ManageShelf";
import { GetBook } from "@/components/books/GetBook";
import { EditionList } from "./EditionList";
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
  initialSelected,
}: {
  initialSelected?: string;
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
  const [selected, setSelected] = useState<string | null>(
    initialSelected ?? null,
  );
  const [newShelf, setNewShelf] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [tab, setTab] = useState("Details");
  const [notes, setNotes] = useState("");
  const booksRef = useRef(books);
  booksRef.current = books;
  useEffect(() => {
    setTab("Details");
    setNotes(
      booksRef.current.find((b) => b.id === selected)?.privateNotes ?? "",
    );
  }, [selected]);
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
          if (sort === "progress")
            return (
              (b.pageCount ? b.currentPage / b.pageCount : 0) -
              (a.pageCount ? a.currentPage / a.pageCount : 0)
            );
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
    const { customShelfIds, privateNotes: pendingNotes, ...fields } = patch;
    if (pendingNotes === undefined)
      update({
        ...book,
        ...fields,
        ...(customShelfIds
          ? {
              customShelves: shelves.filter((s) =>
                customShelfIds.includes(s.id),
              ),
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
      return true;
    } catch {
      update(previous);
      toast("That didn't save. Try again.", "error");
      return false;
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
          {!isDefault && shelf !== "all" && (
            <Button size="sm" variant="ghost" onClick={() => setManaging(true)}>
              Manage shelf
            </Button>
          )}
          <Link
            href="/library/gifts"
            className="block text-sm text-shelf-700 mt-4 px-3"
          >
            Gift lists
          </Link>
          <Link
            href="/library/diary"
            className="block text-sm text-shelf-700 mt-4 px-3"
          >
            Reading diary
          </Link>
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
                <option value="progress">Progress</option>
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
                <div key={b.id}>
                  <button
                    className="block w-full text-left rounded focus-visible:outline-shelf-700"
                    key={b.id}
                    onClick={() => setSelected(b.id)}
                  >
                    {grid ? (
                      <BookCardVertical book={b} />
                    ) : (
                      <BookCard book={b} />
                    )}
                  </button>
                  {b.shelf === "reading_now" && (
                    <div className="px-4 pb-3">
                      <ProgressBar
                        currentPage={b.currentPage}
                        totalPages={b.pageCount}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLogging(b.id)}
                      >
                        Log pages
                      </Button>
                    </div>
                  )}
                </div>
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
      {managing && shelves.find((s) => s.id === shelf) && (
        <ManageShelf
          shelf={shelves.find((s) => s.id === shelf)!}
          onClose={() => setManaging(false)}
          onRenamed={(renamed) => {
            setShelves((current) =>
              current.map((s) => (s.id === renamed.id ? renamed : s)),
            );
            setBooks((current) =>
              current.map((b) => ({
                ...b,
                customShelves: b.customShelves.map((s) =>
                  s.id === renamed.id ? renamed : s,
                ),
              })),
            );
            setManaging(false);
            toast("Shelf renamed.", "success");
          }}
          onDeleted={() => {
            setShelves((current) => current.filter((s) => s.id !== shelf));
            setBooks((current) =>
              current.map((b) => ({
                ...b,
                customShelves: b.customShelves.filter((s) => s.id !== shelf),
              })),
            );
            setShelf("all");
            setManaging(false);
            toast("Shelf deleted. Your books are still here.", "success");
          }}
        />
      )}
      {logging && books.find((b) => b.id === logging) && (
        <Modal open onClose={() => setLogging(null)} title="Log your reading">
          <LogSession
            key={logging}
            book={books.find((b) => b.id === logging)!}
            onCancel={() => setLogging(null)}
            onSaved={(book, pages) => {
              update(book);
              setLogging(null);
              toast(
                `${pages} pages logged. You are on page ${book.currentPage}.`,
                "success",
              );
            }}
          />
        </Modal>
      )}
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
          drawer
          onClose={async () => {
            if (busy) return;
            if (
              notes !== (book.privateNotes ?? "") &&
              !(await save({ privateNotes: notes }))
            )
              return;
            setSelected(null);
          }}
          title={book.title}
        >
          <div className="space-y-5">
            <BookCard book={book} />
            <p className="text-sm text-ink-500">
              Reading {book.cycleNumber ?? 1}
            </p>
            <StartReread
              key={book.id}
              book={book}
              onSaved={update}
              disabled={busy || notes !== (book.privateNotes ?? "")}
            />
            <ProgressBar
              currentPage={book.currentPage}
              totalPages={book.pageCount}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || notes !== (book.privateNotes ?? "")}
              onClick={() => {
                setSelected(null);
                setLogging(book.id);
              }}
            >
              Log pages
            </Button>
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
            <div
              role="tablist"
              aria-label="Book details"
              className="flex border-b border-ink-200"
            >
              {["Details", "Notes", "Sessions", "Editions"].map(
                (name, index, tabs) => (
                  <button
                    key={name}
                    id={`book-tab-${name}`}
                    role="tab"
                    aria-selected={tab === name}
                    aria-controls={`book-panel-${name}`}
                    tabIndex={tab === name ? 0 : -1}
                    className={`flex-1 py-2 text-sm ${tab === name ? "border-b-2 border-shelf-700 text-shelf-700" : "text-ink-500"}`}
                    onClick={() => setTab(name)}
                    onKeyDown={(e) => {
                      const next =
                        e.key === "ArrowRight"
                          ? (index + 1) % 4
                          : e.key === "ArrowLeft"
                            ? (index + 3) % 4
                            : e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? 3
                                : -1;
                      if (next >= 0) {
                        e.preventDefault();
                        setTab(tabs[next]);
                        document
                          .getElementById(`book-tab-${tabs[next]}`)
                          ?.focus();
                      }
                    }}
                  >
                    {name}
                  </button>
                ),
              )}
            </div>
            <section
              role="tabpanel"
              id="book-panel-Notes"
              aria-labelledby="book-tab-Notes"
              hidden={tab !== "Notes"}
            >
              <label className="block text-sm">
                Private notes
                <Textarea
                  disabled={busy}
                  rows={5}
                  maxLength={20000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => {
                    if (!busy && notes !== (book.privateNotes ?? ""))
                      void save({ privateNotes: notes });
                  }}
                  className="mt-1"
                />
              </label>
              <p className="text-xs text-ink-500 mt-2">
                Private to you. Saves when you leave the field.
              </p>
              {notes !== (book.privateNotes ?? "") && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => save({ privateNotes: notes })}
                >
                  {busy ? "Saving..." : "Save notes"}
                </Button>
              )}
            </section>
            <section
              role="tabpanel"
              id="book-panel-Sessions"
              aria-labelledby="book-tab-Sessions"
              hidden={tab !== "Sessions"}
            >
              <SessionHistory bookId={book.id} latestId={book.lastSessionId} />
            </section>
            <section
              role="tabpanel"
              id="book-panel-Editions"
              aria-labelledby="book-tab-Editions"
              hidden={tab !== "Editions"}
            >
              {tab === "Editions" && notes !== (book.privateNotes ?? "") && (
                <p role="status">
                  Save your notes in the Notes tab before choosing another
                  edition.
                </p>
              )}
              {tab === "Editions" &&
                !busy &&
                notes === (book.privateNotes ?? "") && (
                  <EditionList
                    book={book}
                    onAdded={(b) => {
                      update(b);
                      setSelected(b.id);
                    }}
                    onFind={() => {
                      setSelected(null);
                      setAdding(true);
                    }}
                  />
                )}
            </section>
            <section
              role="tabpanel"
              id="book-panel-Details"
              aria-labelledby="book-tab-Details"
              hidden={tab !== "Details"}
              className="space-y-4"
            >
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt>Publisher</dt>
                <dd>{book.publisher ?? "Unknown"}</dd>
                <dt>Language</dt>
                <dd>{book.language ?? "Not recorded"}</dd>
                {!!book.translators?.length && (
                  <>
                    <dt>Translator</dt>
                    <dd>{book.translators.join(", ")}</dd>
                  </>
                )}
                <dt>Published</dt>
                <dd>{book.year ?? "Unknown"}</dd>
                <dt>Pages</dt>
                <dd>{book.pageCount ?? "Unknown"}</dd>
                <dt>Format</dt>
                <dd className="capitalize">
                  {book.format.replaceAll("_", " ")}
                </dd>
                <dt>ISBN</dt>
                <dd>{book.isbn13 ?? "Not recorded"}</dd>
              </dl>
              {book.workId && !busy && notes === (book.privateNotes ?? "") && (
                <Link
                  href={`/book/${book.workId}`}
                  className="text-sm text-shelf-700 hover:underline"
                >
                  View public book page
                </Link>
              )}
              <GetBook
                title={book.title}
                author={book.author}
                isbn13={book.isbn13}
              />
              {book.description && (
                <p className="text-sm whitespace-pre-wrap">
                  {book.description}
                </p>
              )}
              {!!book.genres?.length && (
                <p className="text-sm text-ink-500">{book.genres.join(", ")}</p>
              )}
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
            </section>
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
