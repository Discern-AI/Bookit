"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function open(next: "edit" | "delete") {
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
          version: session.version,
          ...(mode === "edit"
            ? { date, pageStart: Number(start), pageEnd: Number(end), note }
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
              : "Correct the reading date, page range or private note."}{" "}
            Your book shelf, start/finish dates and rating stay unchanged.
            Session times are preserved when editing.
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
