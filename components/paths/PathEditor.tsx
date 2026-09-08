"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { PathBook, PathDraft } from "@/lib/path-data";
export function PathEditor({ initial }: { initial?: PathDraft }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isPublic, setPublic] = useState(initial?.isPublic ?? false);
  const [entries, setEntries] = useState(initial?.entries ?? []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PathBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const requestId = useRef(initial?.id ?? "");
  const router = useRouter();
  const dirty =
    title !== (initial?.title ?? "") ||
    description !== (initial?.description ?? "") ||
    isPublic !== (initial?.isPublic ?? false) ||
    JSON.stringify(entries) !== JSON.stringify(initial?.entries ?? []);
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
    const controller = new AbortController();
    setSearching(true);
    setSearchError("");
    setResults([]);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalogue/works?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search unavailable.");
        if (!controller.signal.aborted) setResults(data.works);
      } catch (e) {
        if (!controller.signal.aborted)
          setSearchError(
            e instanceof Error ? e.message : "Search unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);
  function move(index: number, direction: number) {
    setEntries((current) => {
      const copy = [...current];
      [copy[index], copy[index + direction]] = [
        copy[index + direction],
        copy[index],
      ];
      return copy;
    });
  }
  async function save(remove = false) {
    setBusy(true);
    setError("");
    setConflict(false);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const res = await fetch(
        initial ? `/api/paths/${initial.id}` : "/api/paths",
        {
          method: remove ? "DELETE" : initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: requestId.current,
            version: initial?.version,
            title,
            description,
            isPublic,
            entries: entries.map(({ workId, note }) => ({ workId, note })),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setConflict(res.status === 409);
        throw new Error(
          data.error || "That didn't save. Your draft is still here.",
        );
      }
      router.push(remove ? "/browse/paths?view=mine" : `/path/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That didn't save. Your draft is still here.",
      );
      setConfirm(null);
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <h1 className="font-display text-3xl">
        {initial ? "Edit reading path" : "Create a reading path"}
      </h1>
      <p className="text-ink-500">
        Choose a sequence of books and explain what each one brings to the
        journey.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        <fieldset disabled={busy} className="space-y-5">
          <label className="block text-sm">
            Path title
            <Input
              aria-label="Path title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="block text-sm">
            Description
            <Textarea
              aria-label="Path description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </label>
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Books in order</h2>
            {!entries.length && (
              <p className="text-sm text-ink-500">
                Add the first book from the catalogue below.
              </p>
            )}
            <ol className="space-y-4">
              {entries.map((entry, index) => (
                <li
                  key={entry.workId}
                  className="bg-paper-100 rounded-md p-4 space-y-3"
                >
                  <h3 className="font-medium break-words">
                    {index + 1}. {entry.work.title}
                  </h3>
                  <p className="text-sm text-ink-500">
                    {entry.work.authorName}
                  </p>
                  <label className="block text-sm">
                    Why this book?
                    <Textarea
                      aria-label={`Note for ${entry.work.title}`}
                      value={entry.note}
                      maxLength={2000}
                      rows={2}
                      onChange={(e) =>
                        setEntries((items) =>
                          items.map((item) =>
                            item.workId === entry.workId
                              ? { ...item, note: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={index === 0}
                      aria-label={`Move ${entry.work.title} up`}
                      onClick={() => move(index, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={index === entries.length - 1}
                      aria-label={`Move ${entry.work.title} down`}
                      onClick={() => move(index, 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${entry.work.title}`}
                      onClick={() =>
                        setEntries((items) =>
                          items.filter((item) => item.workId !== entry.workId),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Add from the catalogue</h2>
            <Input
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAttempt((n) => n + 1);
                }
              }}
              aria-label="Search catalogue for path"
              placeholder="Title, author, or ISBN"
              maxLength={300}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-xs text-ink-500">
              Search saved catalogue works. If a book is missing,{" "}
              <Link
                href="/browse"
                target="_blank"
                rel="noopener noreferrer"
                className="text-shelf-700 underline"
              >
                find and add it in Browse
              </Link>
              , then search again here.
            </p>
            {searching && <p role="status">Searching catalogue...</p>}
            {searchError && (
              <p role="alert">
                {searchError}{" "}
                <button
                  type="button"
                  className="text-shelf-700 underline"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Retry
                </button>
              </p>
            )}
            {!searching && !searchError && !results.length && (
              <p>No catalogue matches.</p>
            )}
            <ul className="space-y-2">
              {results.map((work) => (
                <li
                  key={work.id}
                  className="flex items-center justify-between gap-3 border-b border-ink-200 py-2"
                >
                  <span className="min-w-0 text-sm break-words">
                    {work.title}
                    <span className="block text-xs text-ink-500">
                      {work.authorName}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      entries.length >= 100 ||
                      entries.some((e) => e.workId === work.id)
                    }
                    aria-label={`Add ${work.title} to path`}
                    onClick={() =>
                      setEntries((items) => [
                        ...items,
                        { workId: work.id, note: "", work },
                      ])
                    }
                  >
                    {entries.some((e) => e.workId === work.id)
                      ? "Added"
                      : "Add"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <div className="space-y-2 border-t border-ink-200 pt-4">
            <label className="flex gap-2 items-start text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setPublic(e.target.checked)}
              />
              Publish this path
            </label>
            <p className="text-sm text-ink-500">
              {isPublic
                ? "Saving publishes the title, description, book notes and your display name. Anyone with the link can read it, and it will appear in Browse."
                : "Only you can see this path. Unchecking this on a published path makes it private when you save."}
            </p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        {conflict && initial && (
          <Link
            target="_blank"
            href={`/path/${initial.id}`}
            className="block text-shelf-700 underline"
          >
            Open saved path in a new tab
          </Link>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy}>
            Save path
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              dirty
                ? setConfirm("leave")
                : router.push(
                    initial ? `/path/${initial.id}` : "/browse/paths?view=mine",
                  )
            }
          >
            Cancel
          </Button>
          {initial && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirm("delete")}
            >
              Delete path
            </Button>
          )}
        </div>
      </form>
      {confirm && (
        <Modal
          open
          title={
            confirm === "delete"
              ? "Delete this path?"
              : "Discard unsaved changes?"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="mb-4">
            {confirm === "delete"
              ? "The path and its follows will be removed. Books in your library will stay there."
              : "Your changes to this path have not been saved."}
          </p>
          <div className="flex gap-3">
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                confirm === "delete"
                  ? void save(true)
                  : router.push(
                      initial
                        ? `/path/${initial.id}`
                        : "/browse/paths?view=mine",
                    )
              }
            >
              {confirm === "delete" ? "Confirm deletion" : "Discard changes"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep editing
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
