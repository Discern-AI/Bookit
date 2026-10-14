"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { JournalEntry } from "@/lib/book-journal";
type Journal = {
  discussionPosts: {
    id: string;
    parentId: string | null;
    title: string;
    body: string;
    spoilers: boolean;
  }[];
  challenges: { id: string; title: string; count: number; target: number }[];
  book: {
    id: string;
    workId: string;
    title: string;
    author: string;
    coverUrl: string | null;
  };
  copies: {
    id: string;
    privateNotes: string | null;
    importedReview: string | null;
    edition: { format: string };
    readingCycles: {
      id: string;
      number: number;
      dateStarted: string | null;
      dateFinished: string | null;
    }[];
  }[];
  entries: JournalEntry[];
  sessions: {
    id: string;
    date: string;
    pageStart: number;
    pageEnd: number;
    note: string | null;
    userBookId: string;
  }[];
  reviews: { id: string; body: string; isPublic: boolean; isHidden: boolean }[];
  articles: {
    id: string;
    title: string;
    isPublic: boolean;
    isHidden: boolean;
  }[];
  paths: { id: string; title: string }[];
  gifts: { id: string; name: string }[];
  clubReadings: {
    id: string;
    startsOn: string | null;
    endsOn: string | null;
    club: { id: string; name: string };
  }[];
  clubPosts: {
    id: string;
    body: string;
    spoilerPage: number | null;
    createdAt: string;
    reading: { id: string; club: { id: string; name: string } };
  }[];
  hasMore: boolean;
};
export function BookJournal({
  bookId,
  onDirty,
}: {
  bookId: string;
  onDirty?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<Journal | null>(null),
    [error, setError] = useState("");
  const [page, setPage] = useState(0),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [kind, setKind] = useState("note");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null),
    [draft, setDraft] = useState("");
  useEffect(() => {
    onDirty?.(!!text.trim() || !!url.trim() || !!editing);
  }, [text, url, editing, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setBusy(true);
    fetch(`/api/library/${bookId}/journal?page=${page}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load book journal.");
        if (!controller.signal.aborted)
          setData((old) =>
            page && old
              ? {
                  ...d,
                  entries: [...old.entries, ...d.entries],
                  sessions: [...old.sessions, ...d.sessions],
                  articles: [...old.articles, ...d.articles],
                  paths: [...old.paths, ...d.paths],
                  gifts: [...old.gifts, ...d.gifts],
                  clubReadings: [...old.clubReadings, ...d.clubReadings],
                  clubPosts: [...old.clubPosts, ...d.clubPosts],
                  discussionPosts: [
                    ...old.discussionPosts,
                    ...d.discussionPosts,
                  ],
                }
              : d,
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [bookId, page, attempt]);
  const reload = () => {
    setPage(0);
    setAttempt((n) => n + 1);
  };
  async function mutate(path: string, method: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <div role="alert">
          {error}{" "}
          <Button variant="secondary" onClick={reload}>
            Reload journal
          </Button>
        </div>
      )}
      {!data ? (
        <p role="status">
          {error
            ? "Your journal could not be loaded."
            : "Loading your book journal..."}
        </p>
      ) : (
        <>
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-shelf-700">
              Your private book journal
            </p>
            <h1 className="font-display text-3xl">{data.book.title}</h1>
            <p>{data.book.author}</p>
            <p className="text-sm text-ink-500">
              Notes and chat stay private, even when your profile is public.
              History is collected across your editions and rereads.
            </p>
            <div className="flex flex-wrap gap-4 text-shelf-700 underline">
              <Link href={`/library?book=${bookId}`}>
                Book details and reading history
              </Link>
              <Link href={`/chat?book=${bookId}`}>Talk about this book</Link>
            </div>
          </header>
          <section
            aria-label="Add to book journal"
            className="p-4 bg-paper-100 rounded space-y-3"
          >
            <h2 className="font-display text-xl">Keep a thought or a link</h2>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate("/api/journal", "POST", {
                    id: requestId,
                    workId: data.book.workId,
                    kind,
                    text,
                    ...(kind === "link" ? { url } : {}),
                  })
                ) {
                  setText("");
                  setUrl("");
                  setRequestId(crypto.randomUUID());
                  reload();
                }
              }}
            >
              <label className="block">
                Entry type
                <select
                  className="block w-full p-2 border rounded"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="note">Private note</option>
                  <option value="link">Article or social post link</option>
                </select>
              </label>
              <label className="block">
                {kind === "note" ? "Your note" : "Link title or note"}
                <textarea
                  required
                  maxLength={12000}
                  className="block w-full p-2 border rounded"
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {kind === "link" && (
                <label className="block">
                  Web address
                  <input
                    type="url"
                    required
                    className="block w-full p-2 border rounded"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
              )}
              <Button loading={busy} disabled={!text.trim()}>
                Save to book journal
              </Button>
            </form>
          </section>
          <section aria-label="Collected notes and chat" className="space-y-4">
            <h2 className="font-display text-2xl">Notes &amp; conversations</h2>
            {data.copies.map((c) => (
              <div key={c.id} className="space-y-3">
                {c.privateNotes && (
                  <article className="border rounded p-3">
                    <h3 className="text-sm font-medium">
                      Library notes / {c.edition.format}
                    </h3>
                    <p className="whitespace-pre-wrap break-words">
                      {c.privateNotes}
                    </p>
                    <Link className="underline" href={`/library?book=${c.id}`}>
                      Edit library notes
                    </Link>
                  </article>
                )}
                {c.importedReview && (
                  <article className="border rounded p-3">
                    <h3>Imported review (private)</h3>
                    <p className="whitespace-pre-wrap break-words">
                      {c.importedReview}
                    </p>
                  </article>
                )}
              </div>
            ))}
            {!data.entries.length && (
              <p className="text-ink-500">
                New notes and book-linked conversations will collect here.
              </p>
            )}
            {data.entries.map((entry) => (
              <article
                key={entry.id}
                className="border border-ink-200 rounded p-3 space-y-2"
                aria-label={`${entry.kind} entry`}
              >
                <p className="text-xs text-ink-500">
                  {entry.kind === "chat"
                    ? entry.role === "user"
                      ? "You / Chat"
                      : "Folio / Chat"
                    : entry.kind === "link"
                      ? "Saved link"
                      : "Private note"}{" "}
                  / {entry.createdAt.slice(0, 10)}
                </p>
                {editing?.id === entry.id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await mutate(`/api/journal/${entry.id}`, "PATCH", {
                          version: editing.version,
                          text: draft,
                        })
                      ) {
                        setEditing(null);
                        reload();
                      }
                    }}
                    className="space-y-2"
                  >
                    <label>
                      Edit entry
                      <textarea
                        className="block w-full border p-2"
                        required
                        maxLength={12000}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                    </label>
                    <Button loading={busy}>Save entry</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                    >
                      Cancel editing
                    </Button>
                  </form>
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {entry.text}
                  </p>
                )}
                {entry.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-shelf-700 break-all"
                  >
                    Open saved post
                  </a>
                )}
                {entry.conversationId && (
                  <Link
                    href={`/chat?conversation=${entry.conversationId}&book=${bookId}`}
                    className="underline text-shelf-700"
                  >
                    Open conversation
                  </Link>
                )}
                {confirm === entry.id ? (
                  <div>
                    <p>Delete this saved entry? This cannot be undone.</p>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await mutate(`/api/journal/${entry.id}`, "DELETE", {
                            version: entry.version,
                          })
                        ) {
                          setConfirm(null);
                          reload();
                        }
                      }}
                    >
                      Confirm delete entry
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                    >
                      Keep entry
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !!editing}
                      onClick={() => {
                        setEditing(entry);
                        setDraft(entry.text);
                      }}
                    >
                      Edit entry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !!editing}
                      onClick={() => setConfirm(entry.id)}
                    >
                      Delete entry
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </section>
          <section aria-label="Reading sessions" className="space-y-3">
            <h2 className="font-display text-2xl">Reading sessions</h2>
            {!data.sessions.length && <p>No sessions logged yet.</p>}
            {data.sessions.map((s) => (
              <article key={s.id} className="border rounded p-3">
                <p>
                  {s.date.slice(0, 10)} / pages {s.pageStart}-{s.pageEnd}
                </p>
                {s.note && (
                  <p className="whitespace-pre-wrap break-words">{s.note}</p>
                )}
                <Link
                  className="text-shelf-700 underline"
                  href="/library/diary"
                >
                  View or correct in diary
                </Link>
              </article>
            ))}
          </section>
          <section aria-label="Related writing" className="space-y-3">
            <h2 className="font-display text-2xl">
              Your writing &amp; collections
            </h2>
            <p className="text-sm text-ink-500">
              Your reviews, articles containing this book&rsquo;s card, and
              articles made from its review appear automatically. Save other
              posts with a link above.
            </p>
            {data.reviews.map((r) => (
              <article className="border rounded p-3" key={r.id}>
                <h3>
                  Your review /{" "}
                  {r.isHidden ? "Hidden" : r.isPublic ? "Published" : "Private"}
                </h3>
                <p className="whitespace-pre-wrap">{r.body}</p>
                <Link className="underline" href="/community/reviews">
                  Manage your reviews
                </Link>
              </article>
            ))}
            {data.articles.map((a) => (
              <p key={a.id}>
                <Link
                  className="underline text-shelf-700"
                  href={`/creator/${a.id}/edit`}
                >
                  {a.title}
                </Link>{" "}
                /{" "}
                {a.isHidden
                  ? "Hidden"
                  : a.isPublic
                    ? "Published article"
                    : "Draft article"}
              </p>
            ))}
            {data.paths.map((p) => (
              <p key={p.id}>
                <Link className="underline" href={`/path/${p.id}`}>
                  Reading path: {p.title}
                </Link>
              </p>
            ))}
            {data.gifts.map((g) => (
              <p key={g.id}>
                <Link className="underline" href={`/library/gifts/${g.id}`}>
                  Gift list: {g.name}
                </Link>
              </p>
            ))}
          </section>
          {!!data.discussionPosts?.length && (
            <section
              aria-label="Your community discussions"
              className="space-y-3"
            >
              <h2 className="font-display text-2xl">
                Your community discussions
              </h2>
              <p>
                Only your own contributions appear here. These posts are shared
                with signed-in readers.
              </p>
              {data.discussionPosts.map((p) => (
                <article key={p.id} className="border rounded p-3 space-y-2">
                  <Link
                    className="underline"
                    href={`/community/discussions/${p.parentId || p.id}`}
                  >
                    {p.title || "Open discussion for your reply"}
                  </Link>
                  {p.spoilers ? (
                    <details>
                      <summary>Reveal your spoiler content</summary>
                      <p className="whitespace-pre-wrap break-words">
                        {p.body}
                      </p>
                    </details>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                  )}
                </article>
              ))}
            </section>
          )}
          {!!data.challenges?.length && (
            <section aria-label="Your reading challenges">
              <h2 className="font-display text-2xl">Your reading challenges</h2>
              {data.challenges.map((c) => (
                <p key={c.id}>
                  <Link
                    className="underline"
                    href={`/community/challenges#${c.id}`}
                  >
                    {c.title}
                  </Link>{" "}
                  - {c.count} / {c.target} completed
                </p>
              ))}
            </section>
          )}
          {(data.clubReadings.length > 0 || data.clubPosts.length > 0) && (
            <section aria-label="Your book club activity" className="space-y-3">
              <h2 className="font-display text-2xl">Your book clubs</h2>
              <p className="text-sm text-ink-500">
                Your posts and shared readings appear while you are a member.
                Other members&apos; posts stay in the club discussion.
              </p>
              {data.clubReadings.map((r) => (
                <p key={r.id}>
                  <Link
                    className="underline text-shelf-700"
                    href={`/community/clubs/${r.club.id}?reading=${r.id}`}
                  >
                    {r.club.name}
                  </Link>{" "}
                  / {r.startsOn?.slice(0, 10) ?? "Start date open"} /{" "}
                  {r.endsOn?.slice(0, 10) ?? "Finish date open"}
                </p>
              ))}
              {data.clubPosts.map((p) => (
                <article key={p.id} className="border rounded p-3 space-y-2">
                  <p className="text-xs text-ink-500">
                    Your post in {p.reading.club.name} /{" "}
                    {p.createdAt.slice(0, 10)}
                  </p>
                  {p.spoilerPage ? (
                    <details>
                      <summary>Spoilers through page {p.spoilerPage}</summary>
                      <p className="whitespace-pre-wrap break-words">
                        {p.body}
                      </p>
                    </details>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                  )}
                  <Link
                    className="underline text-shelf-700"
                    href={`/community/clubs/${p.reading.club.id}?reading=${p.reading.id}#post-${p.id}`}
                  >
                    Open club discussion
                  </Link>
                </article>
              ))}
            </section>
          )}
          {data.hasMore && (
            <Button
              disabled={busy || !!error}
              onClick={() => setPage((n) => n + 1)}
            >
              Load more history
            </Button>
          )}
        </>
      )}
    </div>
  );
}
