"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CancelReread } from "./CancelReread";
import { Button } from "@/components/ui/Button";
import { localDate } from "@/lib/reading";
import type { LibraryBook } from "@/lib/book-data";
type Cycle = {
  id: string | null;
  number: number;
  version: number;
  isCurrent: boolean;
  dateStarted: string | null;
  dateFinished: string | null;
  canEdit: boolean;
  canCancel: boolean;
  sessionCount: number;
  pages: number;
};
export function CycleHistory({
  book,
  onSaved,
}: {
  book: LibraryBook;
  onSaved: (book: LibraryBook) => void;
}) {
  const router = useRouter();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<Cycle | null>(null);
  const [field, setField] = useState<"dateStarted" | "dateFinished">(
    "dateFinished",
  );
  const label = field === "dateStarted" ? "start" : "finish";
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    fetch(`/api/library/${book.id}/cycles`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "Could not load reading history.");
        if (!controller.signal.aborted) setCycles(data.cycles);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setLoadError(
            e instanceof Error ? e.message : "Could not load reading history.",
          );
      });
    return () => controller.abort();
  }, [book.id, book.lastSessionId, book.cycleVersion, attempt]);
  return (
    <section aria-label="Reading history" className="space-y-4 mb-6">
      <h3 className="font-display text-xl">Reading history</h3>
      {loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Retry reading history
          </Button>
        </div>
      ) : !cycles ? (
        <p role="status">Loading reading history...</p>
      ) : (
        cycles.map((c) => (
          <article
            key={c.number}
            aria-label={`Reading ${c.number}`}
            className="border border-ink-200 rounded p-3 space-y-2"
          >
            <h4 className="font-display text-lg">
              Reading {c.number}
              {c.isCurrent ? " / Current" : ""}
            </h4>
            <p>Started: {c.dateStarted?.slice(0, 10) ?? "Unknown"}</p>
            <p>
              Finished:{" "}
              {c.dateFinished?.slice(0, 10) ??
                (c.canEdit ? "Unknown" : "Not finished")}
            </p>
            <p>
              {c.sessionCount} sessions / {c.pages} pages logged
            </p>
            {c.canCancel && c.id && (
              <CancelReread
                bookId={book.id}
                cycleId={c.id}
                version={c.version}
                disabled={!!edit || busy}
                onSaved={(updated) => {
                  onSaved(updated);
                  setAttempt((n) => n + 1);
                  router.refresh();
                }}
              />
            )}
            {edit?.number === c.number ? (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const r = await fetch(`/api/library/${book.id}/cycles`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        cycleId: edit.id,
                        version: edit.version,
                        [field]: date,
                      }),
                    });
                    const data = await r.json();
                    if (!r.ok)
                      throw new Error(data.error || "Could not save the date.");
                    setEdit(null);
                    onSaved(data.book);
                    setAttempt((n) => n + 1);
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not save the date.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p>
                  {field === "dateFinished"
                    ? "This changes the finish event and yearly totals."
                    : "This changes when this reading started."}{" "}
                  Sessions, shelf, rating and notes stay unchanged.
                </p>
                <label className="block">
                  Corrected {label} date
                  <input
                    className="block w-full border border-ink-200 rounded p-2"
                    type="date"
                    required
                    max={localDate()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy}>Save {label} date</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEdit(null);
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Cancel date correction
                  </Button>
                </div>
                {error && <p role="alert">{error}</p>}
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!!edit || busy}
                  onClick={() => {
                    setEdit(c);
                    setField("dateStarted");
                    setDate(c.dateStarted?.slice(0, 10) ?? "");
                    setError("");
                  }}
                >
                  Correct start date
                </Button>
                {c.canEdit && (
                  <Button
                    variant="secondary"
                    disabled={!!edit || busy}
                    onClick={() => {
                      setField("dateFinished");
                      setEdit(c);
                      setDate(c.dateFinished?.slice(0, 10) ?? "");
                      setError("");
                    }}
                  >
                    Correct finish date
                  </Button>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
