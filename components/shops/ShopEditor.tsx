"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { ShopDraft } from "@/lib/curator-shop";
type Book = { workId: string; title: string; authorName: string };
type Draft = Omit<ShopDraft, "entries"> & {
  entries: (ShopDraft["entries"][number] & Book)[];
};
export function ShopEditor({
  initial,
  username,
  profilePublic,
}: {
  initial: Draft & { version: number };
  username: string;
  profilePublic: boolean;
}) {
  const [draft, setDraft] = useState<Draft>({
    title: initial.title,
    introduction: initial.introduction,
    isPublic: initial.isPublic,
    entries: initial.entries,
  });
  const [version, setVersion] = useState(initial.version),
    [saved, setSaved] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0),
    [books, setBooks] = useState<Book[]>([]),
    [hasNext, setHasNext] = useState(false),
    [loading, setLoading] = useState(false),
    [searchError, setSearchError] = useState("");
  const dirty = JSON.stringify(draft) !== saved;
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
    const timer = setTimeout(() => {
      fetch(`/api/articles/books?q=${encodeURIComponent(query)}&page=${page}`, {
        signal: c.signal,
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error("Could not search your library.");
          if (!c.signal.aborted) {
            setBooks([
              ...new Map<string, Book>(
                d.books.map((b: Book) => [
                  b.workId,
                  {
                    workId: b.workId,
                    title: b.title,
                    authorName: b.authorName,
                  },
                ]),
              ).values(),
            ]);
            setHasNext(d.hasNext);
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setSearchError(e.message);
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
  async function save() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await fetch("/api/creator-shop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, shop: draft }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not save shop.");
      setVersion(data.version);
      setSaved(JSON.stringify(draft));
      setStatus(
        data.isPublic
          ? "Shop saved for your public profile."
          : "Shop saved privately.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save shop.");
    } finally {
      setBusy(false);
    }
  }
  function entry(index: number, changes: Partial<Draft["entries"][number]>) {
    setDraft({
      ...draft,
      entries: draft.entries.map((e, i) =>
        i === index ? { ...e, ...changes } : e,
      ),
    });
  }
  function move(index: number, offset: number) {
    const entries = [...draft.entries];
    [entries[index], entries[index + offset]] = [
      entries[index + offset],
      entries[index],
    ];
    setDraft({ ...draft, entries });
  }
  const field = "block w-full border rounded p-2";
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-5">
      <h1 className="font-display text-3xl">Your curated book shop</h1>
      <p>
        Choose books and write recommendations for your optional public shop.
        Library notes, reading history and chat are never added automatically.
      </p>
      <form
        aria-label="Shop editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          <label className="block">
            Shop title
            <input
              className={field}
              aria-label="Shop title"
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block">
            Shop introduction
            <textarea
              className={field}
              aria-label="Shop introduction"
              maxLength={2000}
              rows={3}
              value={draft.introduction}
              onChange={(e) =>
                setDraft({ ...draft, introduction: e.target.value })
              }
            />
          </label>
          <ol className="space-y-4">
            {draft.entries.map((e, index) => (
              <li key={e.workId} className="border rounded p-3 space-y-2">
                <h2 className="font-display text-xl">
                  {index + 1}. {e.title}
                </h2>
                <p>{e.authorName}</p>
                <label className="block">
                  Recommendation
                  <textarea
                    className={field}
                    aria-label={`Recommendation for ${e.title}`}
                    maxLength={1000}
                    value={e.note}
                    onChange={(v) => entry(index, { note: v.target.value })}
                  />
                </label>
                <label className="block">
                  Retailer URL (optional)
                  <input
                    className={field}
                    aria-label={`Retailer URL for ${e.title}`}
                    type="url"
                    maxLength={2000}
                    value={e.retailerUrl}
                    onChange={(v) =>
                      entry(index, { retailerUrl: v.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={e.affiliate}
                    onChange={(v) =>
                      entry(index, { affiliate: v.target.checked })
                    }
                  />{" "}
                  This is an affiliate link for {e.title}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${e.title} up`}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    disabled={index === draft.entries.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${e.title} down`}
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        entries: draft.entries.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove {e.title}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <label className="block">
            Search your library
            <input
              aria-label="Search shop books"
              className={field}
              value={query}
              maxLength={160}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
          {loading ? (
            <p role="status">Loading books...</p>
          ) : searchError ? (
            <p role="alert">
              {searchError}{" "}
              <button type="button" onClick={() => setAttempt((a) => a + 1)}>
                Retry search
              </button>
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {books.map((b) => (
                <Button
                  key={b.workId}
                  type="button"
                  className="w-full h-auto text-left"
                  disabled={
                    draft.entries.length >= 20 ||
                    draft.entries.some((e) => e.workId === b.workId)
                  }
                  onClick={() =>
                    setDraft({
                      ...draft,
                      entries: [
                        ...draft.entries,
                        { ...b, note: "", retailerUrl: "", affiliate: false },
                      ],
                    })
                  }
                >
                  Add {b.title}
                </Button>
              ))}
              {!books.length && <p>No matching books.</p>}
            </div>
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous books
            </Button>
            <span>Page {page}</span>
            <Button
              type="button"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next books
            </Button>
          </div>
          <label className="block">
            <input
              type="checkbox"
              checked={draft.isPublic}
              onChange={(e) =>
                setDraft({ ...draft, isPublic: e.target.checked })
              }
            />{" "}
            Publish my shop
          </label>
          <p>
            When published, your shop title, introduction, selected books,
            recommendations and retailer links appear with your public display
            name. Saving edits updates the public page immediately. Uncheck and
            save to hide it. Making your profile private also hides the shop;
            making it public again restores a shop still marked published.
          </p>
          {!profilePublic && (
            <p>
              <Link
                className="underline"
                href="/settings/profile"
                target="_blank"
                rel="noopener noreferrer"
              >
                Set up your public profile
              </Link>{" "}
              before publishing. You can save privately now.
            </p>
          )}
          <p>
            Mark affiliate URLs so visitors see a commission disclosure. Folio
            does not enrol you in affiliate programmes, process purchases or pay
            commissions.
          </p>
          <Button type="submit">Save shop</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  "Clear this shop draft? Save afterward to remove all saved recommendations and hide the public shop.",
                )
              )
                setDraft({
                  title: "My book recommendations",
                  introduction: "",
                  isPublic: false,
                  entries: [],
                });
            }}
          >
            Clear shop draft
          </Button>
        </fieldset>
        {dirty && <p>Unsaved shop changes</p>}
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <Link
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href="/creator/shop"
            >
              Open saved shop
            </Link>
          </p>
        )}
      </form>
      {username && version > 0 && (
        <Link
          className="underline"
          href={`/shop/${username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open public shop (available only when published)
        </Link>
      )}
    </main>
  );
}
