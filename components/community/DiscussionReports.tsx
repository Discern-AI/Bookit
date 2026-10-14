"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Discussion } from "./BookDiscussions";
export function DiscussionReports() {
  const [reports, setReports] = useState<
      {
        id: string;
        reason: string;
        post: Discussion & { deletedAt: string | null };
      }[]
    >([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [confirm, setConfirm] = useState<{
      id: string;
      version: number;
      decision: "remove" | "dismiss";
    } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/discussions/reports?page=${page}`, { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          setReports(d.reports);
          setMore(d.hasMore);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setReports([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [page, attempt]);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <Link href="/community/moderation" className="underline">
        Moderation
      </Link>
      <h1 className="text-3xl font-display">Book discussion reports</h1>
      <p>
        Reports are private. Review the current content before removing it.
        Removing a thread also removes its replies.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            disabled={busy}
            className="underline"
            onClick={() => {
              setConfirm(null);
              setAttempt((a) => a + 1);
            }}
          >
            Reload reports
          </button>
        </p>
      )}
      {loading ? (
        <p>Loading reports...</p>
      ) : !error && !reports.length ? (
        <p>No pending reports on this page.</p>
      ) : null}
      {reports.map((r) => (
        <article key={r.id} className="border rounded p-4 space-y-3">
          <h2 className="text-xl break-words">{r.post.work.title}</h2>
          <p className="whitespace-pre-wrap break-words">Reason: {r.reason}</p>
          <p>{r.post.alias}</p>
          <details>
            <summary>Review reported content (may contain spoilers)</summary>
            <p className="break-words">{r.post.title}</p>
            <p className="whitespace-pre-wrap break-words">
              {r.post.deletedAt
                ? "This content has already been deleted."
                : r.post.body}
            </p>
          </details>
          <button
            className="underline"
            disabled={busy || !!confirm || !!r.post.deletedAt}
            onClick={() =>
              setConfirm({
                id: r.id,
                version: r.post.version,
                decision: "remove",
              })
            }
          >
            Remove reported content
          </button>{" "}
          <button
            className="underline"
            disabled={busy || !!confirm}
            onClick={() =>
              setConfirm({
                id: r.id,
                version: r.post.version,
                decision: "dismiss",
              })
            }
          >
            Dismiss report
          </button>
        </article>
      ))}
      {confirm && (
        <div className="border rounded p-3">
          <p>
            Confirm{" "}
            {confirm.decision === "remove"
              ? "removal of the reported content (and replies if it is a thread)"
              : "dismissal of this report"}
            ?
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/discussions/reports", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(confirm),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setConfirm(null);
                setAttempt((a) => a + 1);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not save. Please retry.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm moderation
          </button>{" "}
          <button disabled={busy} onClick={() => setConfirm(null)}>
            Cancel moderation
          </button>
        </div>
      )}
      <nav className="flex gap-4">
        <button
          disabled={page === 0 || loading || busy || !!confirm}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous page
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={!more || loading || busy || !!confirm}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
      </nav>
    </main>
  );
}
