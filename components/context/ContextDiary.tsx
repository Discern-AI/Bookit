"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ContextDownload } from "./ContextDownload";
import type { DiaryEntry } from "@/lib/context-diary";
type Draft = { id: string; version: number; text: string; saved: string };
export function ContextDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]),
    [page, setPage] = useState(1),
    [hasNext, setHasNext] = useState(false),
    [version, setVersion] = useState(0),
    [available, setAvailable] = useState(false),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null),
    [remove, setRemove] = useState<DiaryEntry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const dirty = !!draft && draft.text !== draft.saved;
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setEntries([]);
    fetch(`/api/context/diary?page=${page}`, { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load diary.");
        if (!c.signal.aborted) {
          setEntries(d.entries);
          setVersion(d.contextVersion);
          setAvailable(d.available);
          setHasNext(d.hasNext);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setAvailable(false);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [page, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(deleting = false) {
    const target = deleting ? remove : draft;
    if (!target) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await fetch("/api/context/diary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: deleting ? "delete" : "save",
          id: target.id,
          version: target.version,
          contextVersion: version,
          ...(!deleting ? { text: draft!.text } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save diary.");
      setDraft(null);
      setRemove(null);
      setVersion(d.contextVersion);
      setStatus(deleting ? "Entry deleted." : "Entry saved.");
      setPage(1);
      setAttempt((a) => a + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save diary.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link
        className="underline"
        href="/settings/context"
        onClick={(e) => {
          if (dirty && !window.confirm("Discard unsaved diary changes?"))
            e.preventDefault();
        }}
      >
        Your reading context
      </Link>
      <h1 className="font-display text-3xl">Private context diary</h1>
      <p>
        Personal writing, separate from reading sessions and book journals.
        Entries use server-managed encryption. Chat sends entries to AI only
        when you explicitly select and review them for a request. Dates are
        shown in your browser&apos;s local time.
      </p>
      <p>
        Up to 500 entries, each up to 10,000 characters. Save explicitly to keep
        an entry; unsaved writing stays in this page only.
      </p>
      {!loading && !available && (
        <p role="alert">
          Encryption is unavailable. Check the server key before writing. You
          can still delete saved entries.
        </p>
      )}
      <Button
        type="button"
        disabled={loading || busy || !available || !!draft || !!remove}
        onClick={() => {
          setDraft({
            id: crypto.randomUUID(),
            version: 0,
            text: "",
            saved: "",
          });
          setError("");
          setStatus("");
        }}
      >
        New diary entry
      </Button>
      {draft && (
        <form
          aria-label="Diary entry editor"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            Entry text
            <textarea
              aria-label="Entry text"
              autoFocus
              className="block w-full border rounded p-2"
              rows={8}
              maxLength={10000}
              required
              disabled={busy}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !draft.text.trim()}>
              Save diary entry
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm("Discard unsaved diary changes?"))
                  setDraft(null);
              }}
            >
              Cancel entry
            </Button>
          </div>
          {dirty && <p>Unsaved diary changes</p>}
        </form>
      )}
      {loading && <p role="status">Loading diary...</p>}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <Link
            className="underline"
            href="/settings/context/diary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open saved diary
          </Link>
          {!draft && (
            <button
              type="button"
              className="underline ml-2"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry loading
            </button>
          )}
        </p>
      )}
      <ol className="space-y-4">
        {entries.map((entry, index) => (
          <li key={entry.id} className="border rounded p-4 space-y-3">
            <time dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString()}
            </time>
            {entry.text === null ? (
              <p role="alert">
                This entry cannot be decrypted. Its saved content has not been
                changed.
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{entry.text}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                aria-label={`Edit diary entry ${index + 1}`}
                disabled={
                  busy || loading || !!draft || !!remove || entry.text === null
                }
                onClick={() =>
                  setDraft({
                    id: entry.id,
                    version: entry.version,
                    text: entry.text!,
                    saved: entry.text!,
                  })
                }
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="danger"
                aria-label={`Delete diary entry ${index + 1}`}
                disabled={busy || loading || !!draft || !!remove}
                onClick={() => setRemove(entry)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {!loading && !entries.length && !error && (
        <p>No diary entries on this page.</p>
      )}
      <nav aria-label="Diary pages" className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={page === 1 || loading || busy || !!draft || !!remove}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous entries
        </Button>
        <span>Page {page}</span>
        <Button
          type="button"
          disabled={!hasNext || loading || busy || !!draft || !!remove}
          onClick={() => setPage((p) => p + 1)}
        >
          Next entries
        </Button>
      </nav>
      {remove && (
        <section
          aria-label="Confirm diary entry deletion"
          className="border rounded p-4 space-y-3"
        >
          <p>
            Delete this diary entry? Your profile, other entries and library
            will remain.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Confirm delete entry
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setRemove(null)}
          >
            Keep entry
          </Button>
        </section>
      )}
      <ContextDownload disabled={busy || loading || !available} />
    </main>
  );
}
