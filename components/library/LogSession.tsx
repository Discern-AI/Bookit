"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { localDate, ReadingIntent } from "@/lib/reading";
import type { LibraryBook } from "@/lib/book-data";
export function LogSession({
  book,
  intent,
  defaultDate,
  onSaved,
  onCancel,
}: {
  book: LibraryBook;
  intent?: ReadingIntent;
  defaultDate?: string;
  onSaved: (book: LibraryBook, pages: number) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const initialEnd =
    intent?.pageEnd ??
    (intent?.finished
      ? (book.pageCount ?? book.currentPage)
      : book.currentPage + (intent?.pages ?? 0));
  const initialStart =
    intent?.pageStart ??
    (intent?.pageEnd !== undefined && intent.pages !== undefined
      ? intent.pageEnd - intent.pages
      : book.currentPage);
  const [start, setStart] = useState(String(initialStart));
  const [end, setEnd] = useState(
    initialEnd > initialStart ? String(initialEnd) : "",
  );
  const [date, setDate] = useState(defaultDate ?? localDate());
  const [note, setNote] = useState("");
  const [finished, setFinished] = useState(intent?.finished ?? false);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/library/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userBookId: book.id,
          requestId,
          expectedLastSessionId: book.lastSessionId,
          date,
          pageStart: Number(start),
          pageEnd: Number(end),
          note,
          finished,
          timeStart: timeStart
            ? new Date(`${date}T${timeStart}`).toISOString()
            : null,
          timeEnd: timeEnd
            ? new Date(`${date}T${timeEnd}`).toISOString()
            : null,
        }),
      });
      const data = await res.json();
      if (res.status === 409) setConflict(true);
      if (!res.ok)
        throw new Error(data.error ?? "That didn't save. Try again.");
      onSaved(data.book, Number(end) - Number(start));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-ink-500">
        Check the pages and date before saving this session for {book.title}.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Start page
          <Input
            className="mt-1 w-24"
            type="number"
            min={0}
            max={100000}
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-sm">
          End page
          <Input
            className="mt-1 w-24"
            type="number"
            min={1}
            max={book.pageCount ?? 100000}
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Reading date
          <Input
            className="mt-1"
            type="date"
            required
            max={localDate()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <details>
        <summary className="text-sm text-shelf-700 cursor-pointer">
          Session times (optional)
        </summary>
        <div className="flex gap-3 mt-2">
          <label className="text-sm">
            Start time
            <Input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            End time
            <Input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
            />
          </label>
        </div>
      </details>
      <label className="block text-sm">
        Session note (optional)
        <Textarea
          rows={3}
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          checked={finished}
          onChange={(e) => setFinished(e.target.checked)}
        />
        I finished this book
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {conflict && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            router.refresh();
            onCancel();
          }}
        >
          Close and refresh progress
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Log session
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
