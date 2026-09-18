"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { LibraryBook } from "@/lib/book-data";
export function CancelReread({
  bookId,
  cycleId,
  version,
  disabled,
  onSaved,
}: {
  bookId: string;
  cycleId: string;
  version: number;
  disabled: boolean;
  onSaved: (book: LibraryBook) => void;
}) {
  const [expected, setExpected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return expected === null ? (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => {
        setExpected(version);
        setError("");
      }}
    >
      Cancel this reread
    </Button>
  ) : (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch(`/api/library/${bookId}/reread`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cycleId, version: expected }),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not cancel this reread.");
          setExpected(null);
          onSaved(data.book);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not cancel this reread.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Cancel this empty reread and return the book to Read? The previous
        reading, dates and progress will be restored. Earlier sessions, ratings
        and notes stay unchanged. A reread with any logged sessions cannot be
        cancelled.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button loading={busy}>Confirm reread cancellation</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setExpected(null)}
        >
          Keep this reread
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
