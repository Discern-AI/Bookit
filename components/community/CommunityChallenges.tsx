"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
type Template = {
  id: string;
  title: string;
  kind: string;
  target: number;
  startsOn: string;
  endsOn: string;
  genre: string | null;
  shareVersion: number;
  squares: { position: number; prompt: string }[];
  joinedId: string | null;
};
export function CommunityChallenges({ challengeId }: { challengeId?: string }) {
  const router = useRouter();
  const [page, setPage] = useState(0),
    [items, setItems] = useState<Template[]>([]),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const [join, setJoin] = useState<{ id: string; template: Template } | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `/api/challenges/community?${challengeId ? `id=${encodeURIComponent(challengeId)}` : `page=${page}`}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!controller.signal.aborted) {
          setItems(d.templates);
          setMore(d.hasMore);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "Could not load challenges.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, challengeId, attempt]);
  async function joinChallenge() {
    if (!join) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/challenges/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: join.id,
          sourceId: join.template.id,
          version: join.template.shareVersion,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      router.push(`/community/challenges#${d.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not join. Please retry.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community/challenges">
        My challenges
      </Link>
      <h1 className="font-display text-4xl">Community challenges</h1>
      <p>
        Find book-count goals and themed bingo boards shared by readers. Joining
        creates a private copy with your own reading progress. Your book
        choices, notes and progress are not shared.
      </p>
      {challengeId && (
        <Link className="underline" href="/community/challenges/discover">
          Browse all shared challenges
        </Link>
      )}
      {error && (
        <div role="alert">
          {error}{" "}
          <button
            className="underline"
            disabled={busy}
            onClick={() => {
              setJoin(null);
              setAttempt((a) => a + 1);
            }}
          >
            Reload challenges
          </button>
        </div>
      )}
      {loading ? (
        <p>Loading shared challenges...</p>
      ) : !error && !items.length ? (
        <p>No shared challenges yet.</p>
      ) : null}
      {!loading &&
        !error &&
        items.map((t) => (
          <section key={t.id} className="border rounded-xl p-4 space-y-3">
            <h2 className="text-2xl break-words">{t.title}</h2>
            <p>
              {t.startsOn} to {t.endsOn}
            </p>
            <p>
              {t.kind === "bingo" ? "Nine-square bingo" : `${t.target} books`}
              {t.genre ? ` / ${t.genre}` : ""}
            </p>
            {t.kind === "bingo" && (
              <ol className="list-decimal pl-6">
                {t.squares.map((s) => (
                  <li className="break-words" key={s.position}>
                    {s.prompt}
                  </li>
                ))}
              </ol>
            )}
            {t.joinedId ? (
              <Link
                className="underline"
                href={`/community/challenges#${t.joinedId}`}
              >
                Open my challenge
              </Link>
            ) : (
              <button
                className="border rounded px-3 py-2"
                disabled={busy || !!join}
                onClick={() =>
                  setJoin({ id: crypto.randomUUID(), template: t })
                }
              >
                Join challenge
              </button>
            )}
          </section>
        ))}
      {join && (
        <div className="border rounded-xl p-4 space-y-3">
          <h2 className="text-xl break-words">Join {join.template.title}?</h2>
          <p>
            Your private copy will use these dates and rules. Matching completed
            readings can count immediately. You can delete your copy later
            without changing your books or the shared challenge.
          </p>
          <button
            className="border rounded px-3 py-2"
            disabled={busy}
            onClick={joinChallenge}
          >
            Confirm join
          </button>{" "}
          <button
            disabled={busy}
            onClick={() => {
              setJoin(null);
              setError("");
            }}
          >
            Cancel join
          </button>
        </div>
      )}
      {!challengeId && (
        <nav aria-label="Shared challenge pages" className="flex gap-4">
          <button
            disabled={page === 0 || loading || busy || !!join}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous page
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={!more || loading || busy || !!join}
            onClick={() => setPage((p) => p + 1)}
          >
            Next page
          </button>
        </nav>
      )}
    </main>
  );
}
