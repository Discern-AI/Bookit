"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChallengeSharing } from "./ChallengeSharing";
import { BingoBoard, type BingoSquare, type BingoChoice } from "./BingoBoard";
type Challenge = {
  id: string;
  isPublic: boolean;
  shareVersion: number;
  isCommunityCopy: boolean;
  sourceId: string | null;
  kind: string;
  squares: BingoSquare[];
  lines: number;
  title: string;
  target: number;
  startsOn: string;
  endsOn: string;
  genre: string | null;
  completions: {
    userBookId: string;
    cycleId: string | null;
    title: string;
    date: string;
  }[];
};
export function Challenges() {
  const year = new Date().getFullYear();
  const [kind, setKind] = useState("count"),
    [choices, setChoices] = useState<BingoChoice[]>([]);
  const [prompts, setPrompts] = useState([
    "A new-to-you author",
    "A translated book",
    "A favourite genre",
    "A book recommended by a friend",
    "A short book",
    "A book from your unread shelf",
    "A classic",
    "A different perspective",
    "A book outside your usual genres",
  ]);
  const [items, setItems] = useState<Challenge[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [id, setId] = useState(() => crypto.randomUUID()),
    [title, setTitle] = useState(""),
    [target, setTarget] = useState("12"),
    [start, setStart] = useState(`${year}-01-01`),
    [end, setEnd] = useState(`${year}-12-31`),
    [genre, setGenre] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  async function load() {
    const r = await fetch("/api/challenges");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setItems(d.challenges);
    setChoices(d.choices);
    setLoaded(true);
  }
  useEffect(() => {
    load().catch(() => setError("Could not load challenges. Please retry."));
  }, []);
  async function save(method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/challenges", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (method === "POST") {
        setTitle("");
        setId(crypto.randomUUID());
      }
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/community" className="underline">
        Community
      </Link>
      <h1 className="font-display text-4xl">Reading challenges</h1>
      <Link className="underline" href="/community/challenges/discover">
        Discover community challenges
      </Link>
      <p>
        Private goals based on your reading history. Book-count goals include
        rereads; bingo boards count each selected book once. Undated books do
        not count. Correcting or reopening a reading updates progress
        automatically.
      </p>
      {error && (
        <div role="alert">
          {error}{" "}
          <button
            className="underline"
            disabled={busy}
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch(() => setError("Could not reload. Try again."))
            }
          >
            Retry loading
          </button>
        </div>
      )}
      <form
        className="space-y-3 border rounded-xl p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save("POST", {
            id,
            title,
            kind,
            prompts: kind === "bingo" ? prompts : undefined,
            target: kind === "bingo" ? 9 : Number(target),
            startsOn: start,
            endsOn: end,
            genre: kind === "bingo" ? null : genre || null,
          });
        }}
      >
        <h2 className="text-2xl">New personal challenge</h2>
        <label className="block">
          Challenge type
          <select
            className="block border rounded p-2"
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="count">Book count</option>
            <option value="bingo">Themed bingo (3 by 3)</option>
          </select>
        </label>
        <label className="block">
          Title
          <input
            className="block border rounded p-2 w-full"
            required
            maxLength={120}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {kind === "count" && (
          <label className="block">
            Book target
            <input
              className="block border rounded p-2"
              type="number"
              required
              min={1}
              max={10000}
              value={target}
              disabled={busy}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        )}
        <label className="block">
          Start date
          <input
            className="block border rounded p-2"
            type="date"
            required
            value={start}
            disabled={busy}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="block">
          End date
          <input
            className="block border rounded p-2"
            type="date"
            required
            min={start}
            value={end}
            disabled={busy}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        {kind === "count" && (
          <>
            <label className="block">
              Genre (optional)
              <input
                className="block border rounded p-2 w-full"
                maxLength={100}
                value={genre}
                disabled={busy}
                onChange={(e) => setGenre(e.target.value)}
              />
            </label>
            <p className="text-sm">
              Genre must match a genre in the book metadata, ignoring
              capitalisation. Leave blank to count all genres.
            </p>
          </>
        )}
        {kind === "bingo" && (
          <fieldset className="space-y-2">
            <legend>Nine themed prompts</legend>
            <p className="text-sm">
              Customise each prompt before creating your board. You decide which
              books fit.
            </p>
            {prompts.map((prompt, i) => (
              <label className="block" key={i}>
                Prompt {i + 1}
                <input
                  className="block w-full border rounded p-2"
                  required
                  maxLength={160}
                  disabled={busy}
                  value={prompt}
                  onChange={(e) =>
                    setPrompts(
                      prompts.map((p, j) => (j === i ? e.target.value : p)),
                    )
                  }
                />
              </label>
            ))}
          </fieldset>
        )}
        <button disabled={busy} className="border rounded px-4 py-2">
          Create challenge
        </button>
      </form>
      {!loaded && !error && <p>Loading challenges...</p>}
      {loaded && !items.length && <p>No challenges yet.</p>}
      {items.map((c) => (
        <section
          id={c.id}
          key={c.id}
          className="border rounded-xl p-4 space-y-3"
        >
          <h2 className="text-2xl break-words">{c.title}</h2>
          <p>
            {c.startsOn} to {c.endsOn}
            {c.genre ? ` / ${c.genre}` : ""}
          </p>
          <p>
            {c.completions.length} / {c.target} completed
            {c.completions.length >= c.target ? " - Challenge complete!" : ""}
          </p>
          <progress
            className="w-full"
            aria-label={`${c.title} progress`}
            max={c.target}
            value={Math.min(c.target, c.completions.length)}
          />
          {c.kind === "bingo" ? (
            <BingoBoard
              id={c.id}
              squares={c.squares}
              lines={c.lines}
              choices={choices}
              reload={load}
            />
          ) : (
            <details>
              <summary>Counted readings ({c.completions.length})</summary>
              <ul>
                {c.completions.map((r) => (
                  <li key={r.cycleId || r.userBookId}>
                    <Link
                      className="underline"
                      href={`/library/book/${r.userBookId}`}
                    >
                      {r.title}
                    </Link>{" "}
                    - {r.date}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ChallengeSharing challenge={c} reload={load} />
          {confirm === c.id ? (
            <div>
              <p>
                Delete this challenge? If shared, new joins will stop and
                existing readers will keep their copies. Your books and reading
                history will be kept.
              </p>
              <button
                disabled={busy}
                onClick={() => save("DELETE", { id: c.id })}
              >
                Confirm delete
              </button>{" "}
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              disabled={busy}
              className="underline"
              onClick={() => setConfirm(c.id)}
            >
              Delete challenge
            </button>
          )}
        </section>
      ))}
    </main>
  );
}
