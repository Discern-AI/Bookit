"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AddBook } from "@/components/library/AddBook";
import { languageName, type RemoteEdition } from "@/lib/edition-metadata";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
import type { LibraryBook } from "@/lib/book-data";
export function RemoteEditions({
  workId,
  onAdded,
}: {
  workId: string;
  onAdded?: (book: LibraryBook) => void;
}) {
  const [editions, setEditions] = useState<RemoteEdition[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [lastOffset, setLastOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [selected, setSelected] = useState<OpenLibrarySearchResult | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => controller.current?.abort(), []);
  async function load(offset: number) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    setLastOffset(offset);
    try {
      const res = await fetch(
        `/api/works/${workId}/editions?offset=${offset}`,
        { signal: request.signal },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Editions could not load.");
      if (!request.signal.aborted) {
        setEditions((items) =>
          Array.from(
            new Map(
              [...(offset ? (items ?? []) : []), ...data.editions].map(
                (e: RemoteEdition) => [e.openLibraryId, e],
              ),
            ).values(),
          ),
        );
        setNext(data.nextOffset);
      }
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "Editions could not load.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  async function choose(edition: RemoteEdition) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/works/${workId}/editions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceEditionId: edition.openLibraryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Edition could not be saved.");
      setSelected(data.book);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edition could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  const visible = editions?.filter(
    (e) =>
      (!language || e.languages.includes(language)) &&
      `${e.title} ${e.publisher ?? ""} ${e.translators.join(" ")} ${e.isbn13 ?? ""} ${e.format}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="space-y-4 border-t border-ink-200 pt-4">
      <h3 className="font-display text-xl">More editions &amp; translations</h3>
      <p className="text-sm text-ink-500">
        Explore Open Library records. Choosing an edition checks its identity
        and saves catalogue metadata, then lets you choose a library shelf.
      </p>
      {editions === null && (
        <Button
          variant="secondary"
          disabled={loading || saving}
          onClick={() => void load(0)}
        >
          Load editions from Open Library
        </Button>
      )}
      {editions !== null && (
        <div className="space-y-2">
          <Input
            aria-label="Filter loaded editions"
            placeholder="Title, publisher, translator, or ISBN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="block text-sm">
            Edition language
            <select
              aria-label="Edition language"
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="">All recorded languages</option>
              {Array.from(new Set(editions.flatMap((e) => e.languages)))
                .sort()
                .map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
            </select>
          </label>
          <p className="text-xs text-ink-500">
            Filters apply to the {editions.length} loaded records. Load more to
            explore further.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}{" "}
          <button
            disabled={loading || saving}
            className="underline"
            onClick={() => void load(lastOffset)}
          >
            Retry loading editions
          </button>
        </p>
      )}
      {loading && <p role="status">Loading Open Library editions...</p>}
      {visible?.map((e) => (
        <article
          key={e.openLibraryId}
          className="border border-ink-200 rounded p-4 space-y-2"
        >
          <h4 className="font-medium break-words">{e.title}</h4>
          <p className="text-sm break-words">
            {[
              e.publisher,
              e.year,
              e.format === "unknown"
                ? "Format not recorded"
                : e.format.replaceAll("_", " "),
              e.pageCount ? `${e.pageCount} pages` : null,
            ]
              .filter(Boolean)
              .join(" / ")}
          </p>
          <p className="text-sm">
            {e.languages.length
              ? e.languages.map(languageName).join(", ")
              : "Language not recorded"}
          </p>
          {!!e.translators.length && (
            <p className="text-sm break-words">
              Translated by {e.translators.join(", ")}
            </p>
          )}
          {e.isbn13 && <p className="text-xs text-ink-500">ISBN {e.isbn13}</p>}
          <a
            href={`https://openlibrary.org/books/${e.openLibraryId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-shelf-700 underline"
          >
            Source: Open Library
          </a>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || loading}
            onClick={() => void choose(e)}
          >
            Choose this edition
          </Button>
        </article>
      ))}
      {editions !== null && !visible?.length && !loading && (
        <p className="text-sm text-ink-500">
          No matching editions in the loaded records.
        </p>
      )}
      {next !== null && (
        <Button
          variant="secondary"
          disabled={loading || saving}
          onClick={() => void load(next)}
        >
          Load more editions
        </Button>
      )}
      {selected && (
        <AddBook
          initialBook={selected}
          defaultShelf="tbr"
          onClose={() => setSelected(null)}
          onAdded={(book) => {
            setSelected(null);
            if (onAdded) onAdded(book);
            else {
              router.push(`/library?book=${encodeURIComponent(book.id)}`);
              router.refresh();
            }
          }}
        />
      )}
    </section>
  );
}
