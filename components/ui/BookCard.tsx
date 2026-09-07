"use client";

// BookCard — Implementation Brief §2.3.

import { useState } from "react";
import { ShelfKey } from "@/lib/shelves";
import { ShelfBadge } from "@/components/ui/ShelfBadge";

export interface BookCardBook {
  title: string;
  author: string;
  isbn13?: string | null;
  coverUrl?: string | null;
  year?: number | null;
  pageCount?: number | null;
  format?: string | null;
  shelf?: ShelfKey;
}

function Cover({ book, className }: { book: BookCardBook; className: string }) {
  const [failed, setFailed] = useState(false);
  const src = book.coverUrl ?? (book.isbn13 ? `https://covers.openlibrary.org/b/isbn/${book.isbn13}-M.jpg` : null);

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={[
          "bg-paper-200 text-ink-500 flex items-center justify-center font-display font-semibold flex-shrink-0",
          className,
        ].join(" ")}
      >
        {book.title.charAt(0).toUpperCase()}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className={className} />;
}

export function BookCard({
  book,
  actionSlot,
  className = "",
}: {
  book: BookCardBook;
  actionSlot?: React.ReactNode;
  className?: string;
}) {
  const meta = [book.year, book.pageCount ? `${book.pageCount} pages` : null, book.format]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={["flex gap-4 p-4 bg-paper-100 rounded-md shadow-card", className].join(" ")}>
      <Cover book={book} className="w-14 h-20 object-cover rounded flex-shrink-0 shadow-sm" />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-display text-base font-semibold text-ink-950 truncate">{book.title}</span>
        <span className="text-sm text-ink-500">{book.author}</span>
        {book.shelf && <ShelfBadge shelf={book.shelf} />}
        {meta && <div className="flex gap-2 text-xs text-ink-500 mt-auto">{meta}</div>}
      </div>
      {actionSlot && <div className="ml-auto flex-shrink-0">{actionSlot}</div>}
    </div>
  );
}

export function BookCardVertical({ book, className = "" }: { book: BookCardBook; className?: string }) {
  return (
    <div className={["flex flex-col gap-2 w-40", className].join(" ")}>
      <Cover book={book} className="w-40 h-56 object-cover rounded shadow-card" />
      <span className="font-display text-sm font-semibold text-ink-950 line-clamp-2">{book.title}</span>
      <span className="text-xs text-ink-500">{book.author}</span>
    </div>
  );
}
