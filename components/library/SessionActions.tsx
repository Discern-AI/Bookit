"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { localSessionTime, sessionTimeValue } from "@/lib/session-times";
import { SessionData } from "@/lib/reading";
export function SessionActions({
  session,
}: {
  session: SessionData & { version: number };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [date, setDate] = useState(session.date.slice(0, 10));
  const [start, setStart] = useState(String(session.pageStart));
  const [end, setEnd] = useState(String(session.pageEnd));
  const [note, setNote] = useState(session.note || "");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [version, setVersion] = useState(session.version);
  const [originalTimes, setOriginalTimes] = useState({
    start: session.timeStart,
    end: session.timeEnd,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function open(next: "edit" | "delete") {
    setVersion(session.version);
    setOriginalTimes({ start: session.timeStart, end: session.timeEnd });
    setTimeStart(localSessionTime(session.timeStart));
    setTimeEnd(localSessionTime(session.timeEnd));
    setDate(session.date.slice(0, 10));
    setStart(String(session.pageStart));
    setEnd(String(session.pageEnd));
    setNote(session.note || "");
    setError("");
    setMode(next);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/library/sessions/${session.id}`, {
        method: mode === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          ...(mode === "edit"
            ? {
                date,
                pageStart: Number(start),
                pageEnd: Number(end),
                note,
                timeStart: sessionTimeValue(timeStart, originalTimes.start),
                timeEnd: sessionTimeValue(timeEnd, originalTimes.end),
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save this change.");
      setMode(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this change.");
    } finally {
      setBusy(false);
    }
  }
  const field = "block w-full border border-ink-200 rounded p-2";
  return (
    <div className="mt-2 flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => open("edit")}>
        Edit session
      </Button>
      <Button size="sm" variant="secondary" onClick={() => open("delete")}>
        Delete session
      </Button>
      <Modal
        open={!!mode}
        title={
          mode === "delete" ? "Delete reading session" : "Edit reading session"
        }
        onClose={() => {
          if (!busy) setMode(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p>
            {mode === "delete"
              ? "Remove this session from your history, page totals and reading progress? This cannot be undone."
              : "Correct the reading date, page range, times or private note."}{" "}
            Your book shelf, start/finish dates and rating stay unchanged.
          </p>
          {mode === "edit" && (
            <>
              <label className="block">
                Reading date
                <input
                  className={field}
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="block">
                Start page
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="block">
                End page
                <input
                  className={field}
                  type="number"
                  min={1}
                  max={100000}
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <p className="text-sm">
                Optional times use your device&apos;s local timezone. Enter both
                or clear both; the end must follow the start by no more than 24
                hours. The reading date above controls diary totals
                independently.
              </p>
              <label className="block">
                Session start (local time)
                <input
                  className={field}
                  type="datetime-local"
                  step="0.001"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                />
              </label>
              <label className="block">
                Session end (local time)
                <input
                  className={field}
                  type="datetime-local"
                  step="0.001"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setTimeStart("");
                  setTimeEnd("");
                }}
              >
                Clear session times
              </Button>
              <label className="block">
                Private session note
                <textarea
                  className={field}
                  maxLength={5000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </>
          )}
          <Button loading={busy}>
            {mode === "delete"
              ? "Confirm session deletion"
              : "Save session changes"}
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}
