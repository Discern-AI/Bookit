"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ClubData, ClubReading, ClubPost } from "@/lib/clubs";
const field = "block w-full border border-ink-200 rounded p-2 bg-paper-50";
export function ClubView({
  clubId,
  initialReading,
}: {
  clubId: string;
  initialReading?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<ClubData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [readingId, setReadingId] = useState(initialReading ?? ""),
    [postsPage, setPostsPage] = useState(0),
    [readingsPage, setReadingsPage] = useState(0),
    [membersPage, setMembersPage] = useState(0);
  const [books, setBooks] = useState<
    { id: string; workId: string; title: string }[]
  >([]);
  const [alias, setAlias] = useState(""),
    [invite, setInvite] = useState("");
  const [settings, setSettings] = useState<{
    name: string;
    description: string;
    isPublic: boolean;
    version: number;
  } | null>(null);
  const [schedule, setSchedule] = useState<{
    id: string;
    version: number;
    workId: string;
    startsOn: string;
    endsOn: string;
  } | null>(null);
  const [post, setPost] = useState<{
    id: string;
    version: number;
    body: string;
    spoilerPage: string;
    readingId: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    label: string;
    body: object;
    exit?: boolean;
  } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    const p = new URLSearchParams({
      postsPage: String(postsPage),
      readingsPage: String(readingsPage),
      membersPage: String(membersPage),
    });
    if (readingId) p.set("reading", readingId);
    fetch(`/api/clubs/${clubId}?${p}`, { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [clubId, readingId, postsPage, readingsPage, membersPage, attempt]);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/bookshelf", { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "Could not load your library. Reload the club to try again.",
          );
        const d = await r.json();
        setBooks(d.choices);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [attempt]);
  async function send(body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/clubs/${clubId}`, {
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
  function refresh() {
    setAttempt((n) => n + 1);
  }
  function selectReading(r: ClubReading) {
    if (
      post &&
      post.body.trim() &&
      !window.confirm("Discard this unsaved discussion draft?")
    )
      return;
    setPost(null);
    setReadingId(r.id);
    setPostsPage(0);
  }
  function editPost(p: ClubPost) {
    setPost({
      id: p.id,
      version: p.version,
      body: p.body,
      spoilerPage: p.spoilerPage ? String(p.spoilerPage) : "",
      readingId: data!.selected!.id,
    });
  }
  const locked = busy || loading;
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <Link href="/community/clubs" className="underline">
        Book clubs
      </Link>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button variant="secondary" onClick={refresh}>
            Reload club
          </Button>
        </p>
      )}
      {loading && !data && <p role="status">Loading club...</p>}
      {data && (
        <>
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-ink-500">
              {data.club.isPublic ? "Open club" : "Private club"} /{" "}
              {data.club.memberCount} members
            </p>
            <h1 className="font-display text-4xl break-words">
              {data.club.name}
            </h1>
            <p className="whitespace-pre-wrap break-words">
              {data.club.description}
            </p>
          </header>
          {!data.club.membership?.active ? (
            <form
              aria-label="Join club"
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await send({
                    action: "join",
                    version: data.club.version,
                    membershipVersion: data.club.membership?.version ?? null,
                    alias,
                  })
                ) {
                  refresh();
                }
              }}
            >
              <p>
                Join to see the reading schedule and member-only discussions.
                Your library and private notes are not shared.
              </p>
              <label>
                Your club display name
                <input
                  className={field}
                  required
                  maxLength={60}
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                />
              </label>
              <Button
                disabled={locked || data.club.membership?.blocked}
                loading={busy}
              >
                Join club
              </Button>
              {data.club.membership?.blocked && (
                <p>The owner has removed your membership.</p>
              )}
            </form>
          ) : (
            <>
              <p className="text-sm text-ink-500">
                Participating as {data.club.membership.alias}. Posts are shared
                with members; only your own posts connect to your private book
                journal.
              </p>
              <div className="flex flex-wrap gap-3">
                {data.club.owner ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() =>
                        setSettings({
                          name: data.club.name,
                          description: data.club.description,
                          isPublic: data.club.isPublic,
                          version: data.club.version,
                        })
                      }
                    >
                      Club settings
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() =>
                        setSchedule({
                          id: crypto.randomUUID(),
                          version: 0,
                          workId: "",
                          startsOn: "",
                          endsOn: "",
                        })
                      }
                    >
                      Add club reading
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() =>
                        setConfirm({
                          label:
                            "Generate a new invitation code? Any previous code will stop working. Existing memberships stay active.",
                          body: {
                            action: "invite",
                            version: data.club.version,
                          },
                        })
                      }
                    >
                      Generate invitation code
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={locked || !!post}
                      onClick={() =>
                        setConfirm({
                          label:
                            "Revoke the invitation code? Existing memberships stay active.",
                          body: {
                            action: "revokeInvite",
                            version: data.club.version,
                          },
                        })
                      }
                    >
                      Revoke invitation code
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={locked || !!post}
                      onClick={() =>
                        setConfirm({
                          label:
                            "Delete this club and all its discussions? Members keep their personal books and private notes. This cannot be undone.",
                          body: {
                            action: "delete",
                            version: data.club.version,
                          },
                          exit: true,
                        })
                      }
                    >
                      Delete club
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={locked || !!post}
                    onClick={() =>
                      setConfirm({
                        label:
                          "Leave this club? Its discussions and journal links will no longer be available to you. Your existing posts remain shared with members; delete them first if you want to remove them.",
                        body: {
                          action: "leave",
                          version: data.club.membership!.version,
                        },
                        exit: true,
                      })
                    }
                  >
                    Leave club
                  </Button>
                )}
              </div>
              {invite && (
                <section
                  className="bg-paper-100 p-4 rounded space-y-2"
                  aria-label="Club invitation"
                >
                  <p>
                    Share this code yourself with the people you want to invite.
                    It is shown only now; generating another code replaces it.
                  </p>
                  <code className="block break-all select-all">{invite}</code>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(invite);
                      } catch {
                        setError(
                          "Select and copy the invitation code manually.",
                        );
                      }
                    }}
                  >
                    Copy invitation code
                  </Button>
                  <Button variant="ghost" onClick={() => setInvite("")}>
                    Hide code
                  </Button>
                </section>
              )}
              {confirm && (
                <section
                  aria-label="Confirm club action"
                  className="border rounded p-4 space-y-3"
                >
                  <p>{confirm.label}</p>
                  <Button
                    loading={busy}
                    onClick={async () => {
                      const d = await send(confirm.body);
                      if (d) {
                        if (d.invite) setInvite(d.invite);
                        else setInvite("");
                        if (confirm.exit) router.push("/community/clubs");
                        else {
                          if (
                            "action" in confirm.body &&
                            confirm.body.action === "removeReading"
                          ) {
                            setReadingId("");
                            setPost(null);
                          }
                          refresh();
                        }
                        setConfirm(null);
                      }
                    }}
                  >
                    Confirm action
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel action
                  </Button>
                </section>
              )}
              {settings && (
                <form
                  aria-label="Edit club settings"
                  className="space-y-3 bg-paper-100 rounded p-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await send({ action: "update", ...settings })) {
                      setSettings(null);
                      refresh();
                    }
                  }}
                >
                  <label>
                    Club name
                    <input
                      className={field}
                      required
                      maxLength={100}
                      value={settings.name}
                      onChange={(e) =>
                        setSettings({ ...settings, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      className={field}
                      maxLength={2000}
                      value={settings.description}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.isPublic}
                      onChange={(e) =>
                        setSettings({ ...settings, isPublic: e.target.checked })
                      }
                    />{" "}
                    List as an open club anyone signed in can join
                  </label>
                  <p className="text-sm">
                    The club name, description and member count appear in
                    discovery. Discussion stays members-only.
                  </p>
                  <Button loading={busy}>Save club settings</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSettings(null)}
                  >
                    Cancel settings
                  </Button>
                </form>
              )}
              {schedule && (
                <form
                  aria-label="Schedule club reading"
                  className="space-y-3 bg-paper-100 rounded p-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await send({
                        action: "reading",
                        ...schedule,
                        startsOn: schedule.startsOn || null,
                        endsOn: schedule.endsOn || null,
                      })
                    ) {
                      setReadingId(schedule.id);
                      setPostsPage(0);
                      setSchedule(null);
                      refresh();
                    }
                  }}
                >
                  <label>
                    Book from your library
                    <select
                      className={field}
                      required
                      disabled={
                        !!data.readings.find((r) => r.id === schedule.id)
                      }
                      value={schedule.workId}
                      onChange={(e) =>
                        setSchedule({ ...schedule, workId: e.target.value })
                      }
                    >
                      <option value="">Choose a book</option>
                      {Array.from(
                        new Map(books.map((b) => [b.workId, b])).values(),
                      ).map((b) => (
                        <option key={b.workId} value={b.workId}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start date (optional)
                    <input
                      className={field}
                      type="date"
                      value={schedule.startsOn}
                      onChange={(e) =>
                        setSchedule({ ...schedule, startsOn: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Finish by (optional)
                    <input
                      className={field}
                      type="date"
                      value={schedule.endsOn}
                      onChange={(e) =>
                        setSchedule({ ...schedule, endsOn: e.target.value })
                      }
                    />
                  </label>
                  <p className="text-sm">
                    This shares the chosen book and schedule, not your notes or
                    reading progress. Members choose whether to add it to their
                    own shelves.
                  </p>
                  <Button loading={busy}>Save reading schedule</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSchedule(null)}
                  >
                    Cancel schedule
                  </Button>
                </form>
              )}
              <section aria-label="Club readings" className="space-y-3">
                <h2 className="font-display text-2xl">
                  Shared reading schedule
                </h2>
                {!data.readings.length && <p>No readings scheduled yet.</p>}
                {data.readings.map((r) => (
                  <article key={r.id} className="border rounded p-4 space-y-2">
                    <h3 className="font-display text-xl break-words">
                      {r.work.title}
                    </h3>
                    <p>{r.work.authorName}</p>
                    <p className="text-sm">
                      {r.startsOn?.slice(0, 10) ?? "Start date open"} /{" "}
                      {r.endsOn?.slice(0, 10) ?? "Finish date open"}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={locked || !!post}
                        aria-label={`Discuss ${r.work.title}`}
                        onClick={() => selectReading(r)}
                      >
                        Open discussion
                      </Button>
                      <Link className="underline" href={`/book/${r.workId}`}>
                        Book and editions
                      </Link>
                      {books.find((b) => b.workId === r.workId) && (
                        <Link
                          className="underline"
                          href={`/library/book/${books.find((b) => b.workId === r.workId)!.id}`}
                        >
                          Your book journal
                        </Link>
                      )}
                      {data.club.owner && (
                        <>
                          <Button
                            variant="ghost"
                            disabled={locked || !!post}
                            onClick={() =>
                              setSchedule({
                                id: r.id,
                                version: r.version,
                                workId: r.workId,
                                startsOn: r.startsOn?.slice(0, 10) ?? "",
                                endsOn: r.endsOn?.slice(0, 10) ?? "",
                              })
                            }
                          >
                            Edit schedule
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={locked || !!post}
                            onClick={() =>
                              setConfirm({
                                label:
                                  "Remove this reading and its discussion posts from the club? Personal library records stay unchanged.",
                                body: {
                                  action: "removeReading",
                                  id: r.id,
                                  version: r.version,
                                },
                              })
                            }
                          >
                            Remove reading
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                <div className="flex gap-3">
                  {readingsPage > 0 && (
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() => setReadingsPage((p) => p - 1)}
                    >
                      Previous readings
                    </Button>
                  )}
                  {data.moreReadings && (
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() => setReadingsPage((p) => p + 1)}
                    >
                      More readings
                    </Button>
                  )}
                </div>
              </section>
              {data.selected && (
                <section aria-label="Club discussion" className="space-y-4">
                  <h2 className="font-display text-2xl">
                    Discuss {data.selected.work.title}
                  </h2>
                  <p className="text-sm">
                    Only club members can read this discussion. Add a spoiler
                    page when needed.
                  </p>
                  {!post && (
                    <Button
                      disabled={locked || !!post}
                      onClick={() =>
                        setPost({
                          id: crypto.randomUUID(),
                          version: 0,
                          body: "",
                          spoilerPage: "",
                          readingId: data.selected!.id,
                        })
                      }
                    >
                      Write a discussion post
                    </Button>
                  )}
                  {post && (
                    <form
                      aria-label="Write discussion post"
                      className="space-y-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          await send({
                            action: "post",
                            ...post,
                            spoilerPage: post.spoilerPage
                              ? Number(post.spoilerPage)
                              : null,
                          })
                        ) {
                          setPost(null);
                          setPostsPage(0);
                          refresh();
                        }
                      }}
                    >
                      <label>
                        Your discussion post
                        <textarea
                          className={field}
                          required
                          maxLength={5000}
                          rows={4}
                          value={post.body}
                          onChange={(e) =>
                            setPost({ ...post, body: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Spoilers through page (optional)
                        <input
                          className={field}
                          type="number"
                          min={1}
                          max={100000}
                          value={post.spoilerPage}
                          onChange={(e) =>
                            setPost({ ...post, spoilerPage: e.target.value })
                          }
                        />
                      </label>
                      <Button loading={busy}>Share with club</Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setPost(null)}
                      >
                        Cancel post
                      </Button>
                    </form>
                  )}
                  {!data.posts.length && <p>No discussion posts yet.</p>}
                  {data.posts.map((p) => (
                    <article
                      key={p.id}
                      id={`post-${p.id}`}
                      aria-label="Club post"
                      className="border rounded p-4 space-y-2"
                    >
                      <p className="text-sm">
                        {p.authorAlias} / {p.createdAt.slice(0, 10)}
                        {p.own ? " / You" : ""}
                      </p>
                      {p.spoilerPage ? (
                        <details>
                          <summary className="cursor-pointer">
                            Spoilers through page {p.spoilerPage}
                          </summary>
                          <p className="whitespace-pre-wrap break-words mt-2">
                            {p.body}
                          </p>
                        </details>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">
                          {p.body}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {p.own && (
                          <Button
                            variant="ghost"
                            disabled={locked || !!post}
                            onClick={() => editPost(p)}
                          >
                            Edit post
                          </Button>
                        )}
                        {(p.own || data.club.owner) && (
                          <Button
                            variant="ghost"
                            disabled={locked || !!post}
                            onClick={() =>
                              setConfirm({
                                label:
                                  "Delete this discussion post? It will also disappear from its author\u2019s book journal. This cannot be undone.",
                                body: {
                                  action: "deletePost",
                                  id: p.id,
                                  version: p.version,
                                },
                              })
                            }
                          >
                            Delete post
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                  <div className="flex gap-3">
                    {postsPage > 0 && (
                      <Button
                        variant="secondary"
                        disabled={locked || !!post}
                        onClick={() => setPostsPage((p) => p - 1)}
                      >
                        Newer posts
                      </Button>
                    )}
                    {data.morePosts && (
                      <Button
                        variant="secondary"
                        disabled={locked || !!post}
                        onClick={() => setPostsPage((p) => p + 1)}
                      >
                        Older posts
                      </Button>
                    )}
                  </div>
                </section>
              )}
              <section aria-label="Club members" className="space-y-2">
                <h2 className="font-display text-2xl">Members</h2>
                {data.members.map((m) => (
                  <div key={m.userId} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{m.alias}</span>
                    {data.club.owner && !m.self && (
                      <Button
                        variant="ghost"
                        disabled={locked || !!post}
                        onClick={() =>
                          setConfirm({
                            label: `Remove and block ${m.alias}? They lose access to discussions and cannot rejoin with the invitation code. Existing posts remain unless separately deleted.`,
                            body: {
                              action: "removeMember",
                              userId: m.userId,
                              version: m.version,
                            },
                          })
                        }
                      >
                        Remove member
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex gap-3">
                  {membersPage > 0 && (
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() => setMembersPage((p) => p - 1)}
                    >
                      Previous members
                    </Button>
                  )}
                  {data.moreMembers && (
                    <Button
                      variant="secondary"
                      disabled={locked || !!post}
                      onClick={() => setMembersPage((p) => p + 1)}
                    >
                      More members
                    </Button>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
