"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { localDate } from "@/lib/reading";
import type { LibraryBook } from "@/lib/book-data";
export function StartReread({
  book,
  onSaved,
  disabled,
}: {
  book: LibraryBook;
  onSaved: (book: LibraryBook) => void;
  disabled: boolean;
}) {
  const router = useRouter();
  const [expected, setExpected] = useState<{
    cycleId: string | null;
    version: number;
    requestId: string;
  } | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!book.canReread) return null;
  return (
    <section className="space-y-3">
      {!expected ? (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setExpected({
              cycleId: book.cycleId ?? null,
              version: book.cycleVersion ?? 0,
              requestId: crypto.randomUUID(),
            });
            setDate(localDate());
            setError("");
          }}
        >
          Start reread
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await fetch(`/api/library/${book.id}/reread`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...expected, date }),
              });
              const data = await response.json();
              if (!response.ok)
                throw new Error(data.error || "Could not start this reread.");
              onSaved(data.book);
              setExpected(null);
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not start this reread.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Start reading {book.title} again from page zero? Your earlier
            finishes, sessions, ratings and notes will remain. This moves the
            book to Reading now.
          </p>
          <label className="block">
            Reread start date
            <input
              className="block w-full border border-ink-200 rounded p-2"
              type="date"
              max={localDate()}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button loading={busy}>Confirm reread</Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setExpected(null)}
            >
              Cancel reread
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
