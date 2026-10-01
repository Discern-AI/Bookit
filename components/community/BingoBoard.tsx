"use client";
import { useState } from "react";
import Link from "next/link";
export type BingoChoice = {
  workId: string;
  userBookId: string;
  title: string;
  author: string;
};
export type BingoSquare = {
  id: string;
  position: number;
  prompt: string;
  workId: string | null;
  version: number;
  work: { title: string } | null;
  completion: { userBookId: string; date: string } | null;
};
export function BingoBoard({
  id,
  squares,
  lines,
  choices,
  reload,
}: {
  id: string;
  squares: BingoSquare[];
  lines: number;
  choices: BingoChoice[];
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<{
      squareId: string;
      version: number;
      workId: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/challenges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          squareId: draft.squareId,
          version: draft.version,
          workId: draft.workId || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await reload();
      setDraft(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p>
        {lines} bingo {lines === 1 ? "line" : "lines"} completed
      </p>
      <p className="text-sm">
        Choose books that fit your prompts. Each book can fill one square. A
        square completes when a reading finishes within the challenge dates.
        Selecting a book does not move it on your shelf.
      </p>
      <div className="grid grid-cols-3 gap-2" aria-label="Bingo board">
        {squares.map((s) => {
          const choice = choices.find((c) => c.workId === s.workId);
          return (
            <div
              key={s.id}
              className={`min-w-0 rounded-lg border p-2 space-y-2 break-words ${s.completion ? "bg-green-50 border-green-700" : "bg-white"}`}
            >
              <h3 className="font-semibold text-sm">
                {s.position + 1}. {s.prompt}
              </h3>
              <p className="text-xs">
                {s.completion
                  ? "Completed"
                  : s.workId
                    ? "Planned"
                    : "Choose a book"}
              </p>
              {choice ? (
                <Link
                  className="underline text-sm block"
                  href={`/library/book/${s.completion?.userBookId || choice.userBookId}`}
                >
                  {choice.title}
                </Link>
              ) : s.workId ? (
                <p className="text-sm">
                  {s.work?.title || "Book unavailable"} (no longer in your
                  library)
                </p>
              ) : null}
              <button
                className="underline text-sm"
                disabled={!!draft || busy}
                aria-label={`Choose book for square ${s.position + 1}`}
                onClick={() => {
                  setError("");
                  setDraft({
                    squareId: s.id,
                    version: s.version,
                    workId: s.workId || "",
                  });
                }}
              >
                Choose book
              </button>
            </div>
          );
        })}
      </div>
      {draft && (
        <form
          className="border rounded p-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h3>
            Book for: {squares.find((s) => s.id === draft.squareId)?.prompt}
          </h3>
          <label className="block">
            Book for square
            <select
              aria-label="Book for square"
              className="block w-full min-w-0 border rounded p-2"
              disabled={busy}
              value={draft.workId}
              onChange={(e) => setDraft({ ...draft, workId: e.target.value })}
            >
              <option value="">No book (clear square)</option>
              {draft.workId &&
                !choices.some((c) => c.workId === draft.workId) && (
                  <option value={draft.workId}>
                    Book no longer in library
                  </option>
                )}
              {choices.map((c) => (
                <option key={c.workId} value={c.workId}>
                  {c.title} - {c.author}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="border rounded px-3 py-2" disabled={busy}>
            Save selection
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            Cancel selection
          </button>{" "}
          <button
            type="button"
            className="underline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reload();
                setDraft(null);
                setError("");
              } catch {
                setError("Could not reload. Please retry.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Discard selection and reload
          </button>
        </form>
      )}
    </div>
  );
}
