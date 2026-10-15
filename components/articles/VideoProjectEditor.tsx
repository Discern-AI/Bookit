"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VideoClip } from "./VideoClip";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { VIDEO_PLATFORMS, VIDEO_STATUSES } from "@/lib/video-projects";
import type {
  SavedVideoProject,
  VideoDraft,
  VideoBook,
} from "@/lib/video-projects";
export function VideoProjectEditor({
  initial,
}: {
  initial?: SavedVideoProject;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<VideoDraft>({
    title: initial?.title || "",
    platform: initial?.platform || "other",
    status: initial?.status || "idea",
    script: initial?.script || "",
    notes: initial?.notes || "",
    publishedUrl: initial?.publishedUrl || "",
    additionalLinks: initial?.additionalLinks || [],
  });
  const [selected, setSelected] = useState<VideoBook[]>(initial?.books || []);
  const [id, setId] = useState(initial?.id || "");
  const requestId = useRef(initial?.id || "");
  const [version, setVersion] = useState(initial?.version || 0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [books, setBooks] = useState<VideoBook[]>([]),
    [hasNext, setHasNext] = useState(false),
    [loading, setLoading] = useState(false),
    [searchError, setSearchError] = useState("");
  const project = {
    ...draft,
    books: selected.map(({ workId }) => ({ workId })),
  };
  const fingerprint = JSON.stringify(project);
  const [saved, setSaved] = useState(fingerprint);
  const dirty = fingerprint !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setSearchError("");
    setBooks([]);
    const timer = setTimeout(() => {
      fetch(`/api/articles/books?q=${encodeURIComponent(query)}&page=${page}`, {
        signal: c.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "Could not load books.");
          if (!c.signal.aborted) {
            setBooks([
              ...new Map<string, VideoBook>(
                data.books.map((b: VideoBook) => [
                  b.workId,
                  {
                    workId: b.workId,
                    title: b.title,
                    authorName: b.authorName,
                  },
                ]),
              ).values(),
            ]);
            setHasNext(data.hasNext);
          }
        })
        .catch((e) => {
          if (!c.signal.aborted)
            setSearchError(
              e instanceof Error ? e.message : "Could not load books.",
            );
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, page, attempt]);
  async function save(remove = false) {
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/video-projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          remove
            ? { action: "delete", id: requestId.current, version }
            : { action: "save", id: requestId.current, version, project },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save. Your draft is kept.");
      setSaved(fingerprint);
      if (remove) {
        router.push("/creator/videos");
        router.refresh();
        return;
      }
      setId(data.id);
      setVersion(data.version);
      setStatus("Video plan saved privately.");
      if (!id) router.replace(`/creator/videos/edit?project=${data.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your draft is kept.",
      );
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }
  function move(index: number, offset: number) {
    setSelected((old) => {
      const next = [...old];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  const field = "block w-full border border-ink-200 rounded p-2";
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-5">
      <Link
        className="underline"
        href="/creator/videos"
        onClick={(e) => {
          if (dirty && !window.confirm("Discard unsaved video plan changes?"))
            e.preventDefault();
        }}
      >
        Video plans
      </Link>
      <h1 className="font-display text-3xl">
        {id ? "Edit video plan" : "New video plan"}
      </h1>
      <p>
        Keep your script and production notes private, connected to the books
        you choose. Selecting a platform does not connect an account or upload a
        video.
      </p>
      <form
        aria-label="Video plan editor"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          <label className="block">
            Plan title
            <input
              aria-label="Plan title"
              className={field}
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block">
            Intended platform
            <select
              aria-label="Intended platform"
              className={field}
              value={draft.platform}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  platform: e.target.value as VideoDraft["platform"],
                })
              }
            >
              {Object.entries(VIDEO_PLATFORMS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Production status
            <select
              aria-label="Production status"
              className={field}
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as VideoDraft["status"],
                  additionalLinks:
                    e.target.value === "published" ? draft.additionalLinks : [],
                  publishedUrl:
                    e.target.value === "published" ? draft.publishedUrl : "",
                })
              }
            >
              {Object.entries(VIDEO_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {draft.status === "published" && (
            <label className="block">
              Posted video link
              <input
                aria-label="Posted video link"
                className={field}
                type="url"
                required
                maxLength={2000}
                value={draft.publishedUrl}
                onChange={(e) =>
                  setDraft({ ...draft, publishedUrl: e.target.value })
                }
              />
            </label>
          )}
          {draft.status === "published" && (
            <section aria-label="Additional posted links" className="space-y-3">
              <h2 className="font-display text-xl">Additional posted links</h2>
              <p>
                Record up to five more URLs where you posted this video.
                Platform labels are your own records; Folio does not verify
                them.
              </p>
              {draft.additionalLinks.map((link, index) => (
                <div key={index} className="border rounded p-3 space-y-2">
                  <label className="block">
                    Platform {index + 1}
                    <select
                      aria-label={`Platform ${index + 1}`}
                      className={field}
                      value={link.platform}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          additionalLinks: draft.additionalLinks.map(
                            (item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    platform: e.target
                                      .value as typeof link.platform,
                                  }
                                : item,
                          ),
                        })
                      }
                    >
                      {Object.entries(VIDEO_PLATFORMS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Additional video URL {index + 1}
                    <input
                      aria-label={`Additional video URL ${index + 1}`}
                      className={field}
                      type="url"
                      required
                      maxLength={2000}
                      value={link.url}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          additionalLinks: draft.additionalLinks.map(
                            (item, i) =>
                              i === index
                                ? { ...item, url: e.target.value }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        additionalLinks: draft.additionalLinks.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove posted link {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={draft.additionalLinks.length >= 5}
                onClick={() =>
                  setDraft({
                    ...draft,
                    additionalLinks: [
                      ...draft.additionalLinks,
                      { platform: "other", url: "" },
                    ],
                  })
                }
              >
                Add posted link
              </Button>
            </section>
          )}
          <p className="text-sm">
            Posted elsewhere records a link you provide; Folio does not verify
            or publish it. Returning to an earlier status clears all recorded
            links when you save. Your plan remains private in every status.
          </p>
          <label className="block">
            Video script
            <textarea
              aria-label="Video script"
              className={field}
              rows={10}
              maxLength={20000}
              value={draft.script}
              onChange={(e) => setDraft({ ...draft, script: e.target.value })}
            />
          </label>
          <label className="block">
            Production notes
            <textarea
              aria-label="Production notes"
              className={field}
              rows={5}
              maxLength={5000}
              placeholder="Shots, references, filming and editing notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <section aria-label="Linked video books" className="space-y-3">
            <h2 className="font-display text-2xl">Linked books</h2>
            <p>
              Choose one to twelve books from your collection. Saved plans
              appear in each book journal.
            </p>
            <ol className="space-y-2">
              {selected.map((book, index) => (
                <li key={book.workId} className="border rounded p-3 space-y-2">
                  <p className="break-words">
                    {index + 1}. {book.title}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={index === 0}
                      aria-label={`Move ${book.title} up`}
                      onClick={() => move(index, -1)}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={index === selected.length - 1}
                      aria-label={`Move ${book.title} down`}
                      onClick={() => move(index, 1)}
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove ${book.title}`}
                      onClick={() =>
                        setSelected((old) =>
                          old.filter((b) => b.workId !== book.workId),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <label className="block">
              Search your books
              <input
                aria-label="Search video books"
                className={field}
                maxLength={160}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setAttempt((a) => a + 1);
                  }
                }}
              />
            </label>
            {loading && <p role="status">Loading books...</p>}
            {searchError && (
              <p role="alert">
                {searchError}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setAttempt((a) => a + 1)}
                >
                  Retry book search
                </button>
              </p>
            )}
            {!loading && !searchError && !books.length && (
              <p>No matching books in your collection.</p>
            )}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {books.map((book) => (
                <Button
                  key={book.workId}
                  type="button"
                  variant="secondary"
                  className="w-full h-auto py-2 text-left justify-start"
                  disabled={
                    selected.length >= 12 ||
                    selected.some((b) => b.workId === book.workId)
                  }
                  aria-label={`Link ${book.title}`}
                  onClick={() =>
                    setSelected((old) =>
                      old.some((b) => b.workId === book.workId) ||
                      old.length >= 12
                        ? old
                        : [...old, book],
                    )
                  }
                >
                  <span className="min-w-0 break-words">
                    {book.title} / {book.authorName}
                  </span>
                </Button>
              ))}
            </div>
            <nav aria-label="Video book pages" className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous books
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="ghost"
                disabled={!hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next books
              </Button>
            </nav>
          </section>
        </fieldset>
        {dirty && <p>Unsaved changes</p>}
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            {id && (
              <Link
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
                href={`/creator/videos/edit?project=${id}`}
              >
                Open saved plan
              </Link>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !selected.length}>
            Save video plan
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!draft.script || busy}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([draft.script], { type: "text/plain;charset=utf-8" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "folio-video-script.txt";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download current script
          </Button>
          {id && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete video plan
            </Button>
          )}
        </div>
        <p className="text-sm">
          Download exports the current script only. Save to keep your full plan;
          unsaved edits stay in this open page.
        </p>
      </form>
      {id ? (
        <VideoClip projectId={id} />
      ) : (
        <p>Save your plan to upload a private video clip.</p>
      )}
      {confirmDelete && (
        <section
          aria-label="Confirm video plan deletion"
          className="border rounded p-4 space-y-3"
        >
          <p>
            Delete this video plan, its uploaded clip and book links, including
            unsaved changes? Your library and any video posted elsewhere will
            remain.
          </p>
          <Button
            disabled={busy}
            variant="danger"
            onClick={() => void save(true)}
          >
            Confirm delete video plan
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => setConfirmDelete(false)}
          >
            Keep video plan
          </Button>
        </section>
      )}
    </main>
  );
}
