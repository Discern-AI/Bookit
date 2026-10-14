"use client";
import {
  discussionCommunities,
  discussionCommunity,
} from "@/lib/discussion-communities";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export type Discussion = {
  id: string;
  workId: string;
  communityId: string | null;
  parentId: string | null;
  title: string;
  body: string;
  alias: string;
  spoilers: boolean;
  version: number;
  createdAt: string;
  own: boolean;
  work: { title: string; authorName: string };
};
type Draft = {
  id: string;
  workId: string;
  communityId: string | null;
  parentId: string | null;
  title: string;
  body: string;
  alias: string;
  spoilers: boolean;
  version: number;
  editing: boolean;
};
export function BookDiscussions({
  threadId,
  workId,
  communityId,
  authorName,
}: {
  threadId?: string;
  workId?: string;
  communityId?: string;
  authorName?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<{
      threads?: Discussion[];
      thread?: Discussion;
      posts?: Discussion[];
      book?: { title: string };
      hasMore: boolean;
    } | null>(null),
    [page, setPage] = useState(0),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [books, setBooks] = useState<
      { id: string; workId: string; title: string }[]
    >([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [remove, setRemove] = useState<Discussion | null>(null),
    [report, setReport] = useState<{
      id: string;
      postId: string;
      reason: string;
    } | null>(null);
  const locked = busy || !!draft || !!remove || !!report;
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `/api/discussions?page=${page}${threadId ? `&thread=${encodeURIComponent(threadId)}` : workId ? `&work=${encodeURIComponent(workId)}` : ""}${!threadId && authorName ? `&author=${encodeURIComponent(authorName)}` : ""}${!threadId && communityId ? `&community=${encodeURIComponent(communityId)}` : ""}`,
      { signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [page, attempt, threadId, workId, communityId, authorName]);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/bookshelf", { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load your books. Reload to retry.");
        const d = await r.json();
        if (!c.signal.aborted)
          setBooks([
            ...new Map<string, { id: string; workId: string; title: string }>(
              d.choices.map(
                (b: { id: string; workId: string; title: string }) => [
                  b.workId,
                  b,
                ],
              ),
            ).values(),
          ]);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [attempt]);
  async function send(body: object) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await fetch("/api/discussions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function fresh(parent: Discussion | null) {
    setError("");
    setStatus("");
    setDraft({
      id: crypto.randomUUID(),
      workId: parent?.workId || workId || "",
      communityId: parent ? parent.communityId : communityId || null,
      parentId: parent?.id || null,
      title: "",
      body: "",
      alias: "",
      spoilers: parent?.spoilers || false,
      version: 0,
      editing: false,
    });
  }
  function showPost(p: Discussion) {
    return (
      <article
        key={p.id}
        className="border rounded-xl p-4 space-y-3"
        aria-label="Discussion contribution"
      >
        <p className="break-words">
          {p.alias} / {p.createdAt.slice(0, 10)}
        </p>
        {p.spoilers ? (
          <details>
            <summary>Reveal spoiler content</summary>
            <p className="whitespace-pre-wrap break-words">{p.body}</p>
          </details>
        ) : (
          <p className="whitespace-pre-wrap break-words">{p.body}</p>
        )}
        <div className="flex gap-3 flex-wrap">
          {p.own && (
            <>
              <button
                className="underline"
                disabled={locked}
                onClick={() => {
                  setError("");
                  setDraft({ ...p, editing: true });
                }}
              >
                Edit post
              </button>
              <button
                className="underline"
                disabled={locked}
                onClick={() => {
                  setError("");
                  setRemove(p);
                }}
              >
                Delete post
              </button>
            </>
          )}
          <button
            className="underline"
            disabled={locked}
            onClick={() => {
              setError("");
              setReport({ id: crypto.randomUUID(), postId: p.id, reason: "" });
            }}
          >
            Report post
          </button>
        </div>
      </article>
    );
  }
  const community = discussionCommunity(
    data?.thread?.communityId || communityId || "",
  );
  const field = "block w-full border rounded p-2";
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-5">
      <nav aria-label="Discussion navigation" className="flex flex-wrap gap-3">
        <Link className="underline" href="/community">
          Community
        </Link>{" "}
        <Link className="underline" href="/community/discussions">
          All book discussions
        </Link>
        <Link className="underline" href="/community/spaces">
          Genre and topic communities
        </Link>
        <Link className="underline" href="/community/authors">
          Author communities
        </Link>
      </nav>
      {community && (
        <p>
          <Link
            className="underline"
            href={`/community/discussions?community=${community.id}`}
          >
            {community.name}
          </Link>{" "}
          / {community.description}
        </p>
      )}
      <h1 className="font-display text-3xl break-words">
        {data?.thread?.title ||
          (data?.book
            ? `Discuss ${data.book.title}`
            : authorName
              ? `Discussions about books by ${authorName}`
              : community?.name || "Book discussions")}
      </h1>
      <p>
        Posts are shared with signed-in Folio readers under the display name you
        choose. Your private notes and reading history stay private.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="underline"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setRemove(null);
              setReport(null);
              setAttempt((a) => a + 1);
            }}
          >
            Discard draft and reload discussions
          </button>
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {loading && <p>Loading discussions...</p>}
      {data?.thread && (
        <>
          <Link className="underline" href={`/book/${data.thread.workId}`}>
            {data.thread.work.title}
          </Link>
          <Link
            className="underline"
            href={`/community/authors?author=${encodeURIComponent(data.thread.work.authorName)}`}
          >
            More discussions about books by {data.thread.work.authorName}
          </Link>
          <p>
            {data.thread.spoilers
              ? "Spoilers allowed; content starts collapsed."
              : "Spoiler-free discussion. Keep replies free of plot details."}
          </p>
          {showPost(data.thread)}
          <h2 className="text-xl">Replies</h2>
          {data.posts?.map(showPost)}
          {!data.posts?.length && <p>No replies on this page.</p>}
          <button
            className="border rounded px-3 py-2"
            disabled={locked}
            onClick={() => fresh(data.thread!)}
          >
            Write a reply
          </button>
        </>
      )}
      {data?.threads && (
        <>
          {authorName ? (
            <p>
              Choose a book above to start a discussion. Existing threads across
              this author name appear below.
            </p>
          ) : (
            <button
              className="border rounded px-3 py-2"
              disabled={locked}
              onClick={() => fresh(null)}
            >
              Start a discussion
            </button>
          )}
          {!data.threads.length && <p>No discussions on this page.</p>}
          {data.threads.map((t) => (
            <article key={t.id} className="border rounded-xl p-4 space-y-2">
              <h2 className="text-xl break-words">
                <Link
                  className="underline"
                  href={`/community/discussions/${t.id}`}
                >
                  {t.title}
                </Link>
              </h2>
              <p className="break-words">
                {t.work.title} / {t.alias}
              </p>
              {t.communityId && (
                <Link
                  className="underline"
                  href={`/community/discussions?community=${t.communityId}`}
                >
                  {discussionCommunity(t.communityId)?.name}
                </Link>
              )}
              <p>{t.spoilers ? "Spoilers allowed" : "Spoiler-free"}</p>
            </article>
          ))}
        </>
      )}
      {draft && (
        <form
          aria-label="Discussion editor"
          className="border rounded-xl p-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fields = draft;
            const d = await send({ action: "post", ...fields });
            if (d) {
              setDraft(null);
              if (!threadId) router.push(`/community/discussions/${d.id}`);
              else {
                setStatus("Post saved. Replies are listed oldest first.");
                setAttempt((a) => a + 1);
              }
            }
          }}
        >
          {!draft.parentId && !draft.editing && (
            <label className="block">
              Community
              <select
                className={field}
                aria-label="Community"
                disabled={busy || !!communityId}
                value={draft.communityId || ""}
                onChange={(e) =>
                  setDraft({ ...draft, communityId: e.target.value || null })
                }
              >
                <option value="">General book discussions</option>
                {discussionCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!draft.parentId && !draft.editing && !workId && (
            <label className="block">
              Book from your library
              <select
                aria-label="Discussion book"
                className={field}
                required
                disabled={busy}
                value={draft.workId}
                onChange={(e) => setDraft({ ...draft, workId: e.target.value })}
              >
                <option value="">Choose a book</option>
                {books.map((b) => (
                  <option key={b.workId} value={b.workId}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!draft.parentId && (
            <label className="block">
              Discussion title
              <input
                className={field}
                required
                maxLength={160}
                disabled={busy}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
          )}
          <label className="block">
            Discussion display name
            <input
              className={field}
              required
              maxLength={60}
              disabled={busy}
              value={draft.alias}
              onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
            />
          </label>
          <label className="block">
            Your post
            <textarea
              className={field}
              rows={5}
              required
              maxLength={5000}
              disabled={busy}
              aria-label="Your post"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          {!draft.parentId && !draft.editing && (
            <label>
              <input
                type="checkbox"
                checked={draft.spoilers}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, spoilers: e.target.checked })
                }
              />{" "}
              Allow spoilers in this discussion
            </label>
          )}
          <p className="text-sm">
            Keep titles free of spoilers. The spoiler setting is fixed when the
            thread is created and applies to all replies. The book and community
            are also fixed. Only write information you want to share.
          </p>
          <button className="border rounded px-3 py-2" disabled={busy}>
            {draft.editing ? "Save post changes" : "Publish post"}
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            Cancel post
          </button>
        </form>
      )}
      {remove && (
        <section
          aria-label="Confirm post deletion"
          className="border rounded p-3 space-y-3"
        >
          <p>
            {remove.parentId
              ? "Delete this reply?"
              : "Delete this thread and all its replies, including other readers' replies?"}{" "}
            Your private book records will be kept.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (
                await send({
                  action: "delete",
                  id: remove.id,
                  version: remove.version,
                })
              ) {
                setRemove(null);
                if (!remove.parentId)
                  router.push(
                    `/community/discussions?work=${remove.workId}${remove.communityId ? `&community=${remove.communityId}` : ""}`,
                  );
                else setAttempt((a) => a + 1);
              }
            }}
          >
            Confirm delete post
          </button>{" "}
          <button disabled={busy} onClick={() => setRemove(null)}>
            Cancel deletion
          </button>
        </section>
      )}
      {report && (
        <form
          className="border rounded p-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ action: "report", ...report })) {
              setReport(null);
              setStatus("Report recorded for moderator review.");
            }
          }}
        >
          <label className="block">
            Report reason
            <textarea
              className={field}
              required
              maxLength={1000}
              disabled={busy}
              value={report.reason}
              onChange={(e) => setReport({ ...report, reason: e.target.value })}
            />
          </label>
          <p>Reports are private to moderators.</p>
          <button disabled={busy}>Submit report</button>{" "}
          <button type="button" disabled={busy} onClick={() => setReport(null)}>
            Cancel report
          </button>
        </form>
      )}
      {data && (
        <nav aria-label="Discussion pages" className="flex gap-4">
          <button
            disabled={page === 0 || loading || locked}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous page
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={!data.hasMore || loading || locked}
            onClick={() => setPage((p) => p + 1)}
          >
            Next page
          </button>
        </nav>
      )}
    </main>
  );
}
