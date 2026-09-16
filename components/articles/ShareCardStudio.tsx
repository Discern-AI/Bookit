"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  drawShareCard,
  shareCardDescription,
  ShareCardBook,
  ShareCardInput,
} from "@/lib/share-cards";
export function ShareCardStudio({ publicByline }: { publicByline: string }) {
  const [books, setBooks] = useState<ShareCardBook[]>([]);
  const [book, setBook] = useState<ShareCardBook | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [kind, setKind] = useState<"book" | "quote">("book");
  const [format, setFormat] = useState<"square" | "portrait">("square");
  const [theme, setTheme] = useState<"paper" | "night">("paper");
  const [caption, setCaption] = useState("");
  const [quote, setQuote] = useState("");
  const [reference, setReference] = useState("");
  const [includeByline, setIncludeByline] = useState(false);
  const [rendered, setRendered] = useState("");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const swatch = useRef<HTMLSpanElement>(null);
  const display = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const requestNumber = useRef(0);
  const input: ShareCardInput | null = book
    ? {
        kind,
        format,
        theme,
        book,
        caption,
        quote,
        page: reference,
        byline: includeByline ? publicByline : "",
      }
    : null;
  const fingerprint = JSON.stringify(input);
  const current = useRef(fingerprint);
  current.current = fingerprint;
  async function search(next = 1) {
    const request = ++requestNumber.current;
    setLoading(true);
    setSearchError("");
    try {
      const response = await fetch(
        `/api/articles/books?q=${encodeURIComponent(q)}&page=${next}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load your collection.");
      if (request !== requestNumber.current) return;
      setBooks(data.books);
      setPage(next);
      setHasNext(data.hasNext);
    } catch (e) {
      if (request === requestNumber.current)
        setSearchError(
          e instanceof Error ? e.message : "Could not load books.",
        );
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }
  useEffect(() => {
    void search(); /* The initial collection query runs once. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError("");
    if (
      !input ||
      !canvas.current ||
      !swatch.current ||
      !display.current ||
      !body.current
    ) {
      setRendered("");
      return;
    }
    const value = input;
    async function render() {
      try {
        const displayFont = getComputedStyle(display.current!).fontFamily;
        const bodyFont = getComputedStyle(body.current!).fontFamily;
        await Promise.all([
          document.fonts.load(`400 76px ${displayFont}`),
          document.fonts.load(`500 24px ${bodyFont}`),
        ]);
        if (cancelled) return;
        const colors = getComputedStyle(swatch.current!);
        drawShareCard(canvas.current!, value, {
          displayFont,
          bodyFont,
          background: colors.backgroundColor,
          ink: colors.color,
          accent: colors.borderTopColor,
        });
        setRendered(fingerprint);
      } catch (e) {
        if (!cancelled) {
          setRendered("");
          setError(e instanceof Error ? e.message : "Could not render card.");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
    // fingerprint includes every field used by the renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);
  async function download() {
    if (!canvas.current || rendered !== fingerprint) return;
    setDownloading(true);
    setError("");
    const requested = fingerprint;
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("Could not create the PNG. Try again.")),
          "image/png",
        ),
      );
      if (current.current !== requested)
        throw new Error(
          "The card changed. Review the updated preview before downloading.",
        );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `folio-${kind}-card-${format}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download card.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/creator">
        Your articles
      </Link>
      <h1 className="font-display text-4xl">Shareable cards</h1>
      <p>
        Make a book or quote card and download a PNG to share. Only the fields
        shown in the preview are included.
      </p>
      <div className="grid lg:grid-cols-2 gap-8">
        <section className="space-y-4" aria-label="Card controls">
          <h2 className="font-display text-2xl">Choose a book</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              className="min-w-0 flex-1 border border-ink-200 rounded p-2"
              aria-label="Search your collection"
              value={q}
              maxLength={160}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button loading={loading}>Search</Button>
          </form>
          {searchError && <p role="alert">{searchError}</p>}
          {!loading && !books.length && !searchError && (
            <p>No matching books in your collection.</p>
          )}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {books.map((b) => (
              <Button
                key={b.editionId}
                variant="secondary"
                className="w-full h-auto py-3 justify-start text-left"
                aria-pressed={book?.editionId === b.editionId}
                onClick={() => setBook(b)}
              >
                <span className="min-w-0 break-words">
                  {b.title} / {b.authorName}
                </span>
              </Button>
            ))}
          </div>
          <nav className="flex gap-3" aria-label="Collection pages">
            {page > 1 && (
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => search(page - 1)}
              >
                Previous books
              </Button>
            )}
            {hasNext && (
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => search(page + 1)}
              >
                Next books
              </Button>
            )}
          </nav>
          {book && <p>Selected: {book.title}</p>}
          <label className="block">
            Card type
            <select
              className="block w-full border border-ink-200 rounded p-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="book">Book card</option>
              <option value="quote">Quote card</option>
            </select>
          </label>
          {kind === "book" ? (
            <label className="block">
              Caption (optional)
              <textarea
                className="block w-full border border-ink-200 rounded p-2"
                value={caption}
                maxLength={180}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="block">
                Quote
                <textarea
                  className="block w-full border border-ink-200 rounded p-2"
                  value={quote}
                  maxLength={500}
                  onChange={(e) => setQuote(e.target.value)}
                />
              </label>
              <p className="text-sm text-ink-500">
                Enter the quote from your copy of the book and check its wording
                and attribution.
              </p>
              <label className="block">
                Page or reference (optional)
                <input
                  className="block w-full border border-ink-200 rounded p-2"
                  value={reference}
                  maxLength={40}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="block">
            Layout
            <select
              className="block w-full border border-ink-200 rounded p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="square">Square / 1080 x 1080</option>
              <option value="portrait">Portrait / 1080 x 1350</option>
            </select>
          </label>
          <label className="block">
            Colour theme
            <select
              className="block w-full border border-ink-200 rounded p-2"
              value={theme}
              onChange={(e) => setTheme(e.target.value as typeof theme)}
            >
              <option value="paper">Paper</option>
              <option value="night">Night</option>
            </select>
          </label>
          {publicByline ? (
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={includeByline}
                onChange={(e) => setIncludeByline(e.target.checked)}
              />
              Include public byline: {publicByline}
            </label>
          ) : (
            <p className="text-sm text-ink-500">
              An optional byline is available when you have a public profile.
            </p>
          )}
          <p className="text-sm text-ink-500">
            Card text stays in this open page. Download your card before
            leaving.
          </p>
        </section>
        <section className="space-y-4" aria-label="Card preview">
          <h2 className="font-display text-2xl">Preview</h2>
          <div aria-hidden="true" className="hidden">
            <span
              ref={swatch}
              className={
                theme === "paper"
                  ? "bg-paper-100 text-ink-950 border-shelf-700"
                  : "bg-ink-950 text-paper-50 border-shelf-100"
              }
            />
            <span ref={display} className="font-display" />
            <span ref={body} className="font-body" />
          </div>
          {!book && <p>Select a book to start your card.</p>}
          <canvas
            ref={canvas}
            role="img"
            aria-label={input ? shareCardDescription(input) : "Card preview"}
            className={`w-full h-auto rounded shadow-card ${!input || rendered !== fingerprint ? "hidden" : ""}`}
          />
          {error && <p role="alert">{error}</p>}
          {book && !error && rendered !== fingerprint && (
            <p role="status">Preparing preview...</p>
          )}
          <Button
            disabled={!input || rendered !== fingerprint}
            loading={downloading}
            onClick={download}
          >
            Download PNG
          </Button>
          <p className="text-sm text-ink-500">
            The download matches this preview. Downloading keeps your profile,
            shelves and articles at their current visibility settings.
          </p>
        </section>
      </div>
    </main>
  );
}
