"use client";
import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
type Book = {
  editionId: string;
  workId: string;
  title: string;
  authorName: string;
  coverUrl: string;
};
export function ArticleEmbeds({
  editor,
  articleId,
  saved,
  disabled,
}: {
  editor: Editor | null;
  articleId: string;
  saved: boolean;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"image" | "book" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState<{ id: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  async function json(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load.");
    return data;
  }
  async function search(next = 1) {
    setBusy(true);
    setError("");
    try {
      const data = await json(
        `/api/articles/books?q=${encodeURIComponent(q)}&page=${next}`,
      );
      setBooks(data.books);
      setPage(next);
      setHasNext(data.hasNext);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find books.");
    } finally {
      setBusy(false);
    }
  }
  async function open(next: "image" | "book") {
    setMode(next);
    setError("");
    setSelected("");
    setFile(null);
    setAlt("");
    setCaption("");
    if (next === "book") {
      await search();
      return;
    }
    setBusy(true);
    try {
      setImages(await json(`/api/articles/${articleId}/images`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load images.");
    } finally {
      setBusy(false);
    }
  }
  async function insertImage() {
    if (!alt.trim()) {
      setError("Describe the image for readers using a screen reader.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let imageId = selected;
      if (file) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Choose an image up to 5 MB.");
        const data = await json(`/api/articles/${articleId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        imageId = data.imageId;
      }
      if (!imageId) throw new Error("Choose an image first.");
      editor
        ?.chain()
        .focus()
        .insertContent([
          {
            type: "articleImage",
            attrs: { imageId, alt: alt.trim(), caption },
          },
          { type: "paragraph" },
        ])
        .run();
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not insert image.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await json(`/api/article-images/${id}`, { method: "DELETE" });
      setImages(images.filter((i) => i.id !== id));
      if (selected === id) setSelected("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove upload.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={disabled || !editor || !saved}
          onClick={() => open("image")}
        >
          Insert image
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !editor}
          onClick={() => open("book")}
        >
          Insert book card
        </Button>
      </div>
      {!saved && (
        <p className="text-sm text-ink-500">
          Save your draft once to add images.
        </p>
      )}
      <p className="text-sm text-ink-500">
        Select an image or book card in the editor and press Delete to remove
        it. Images become public only when included in your published article.
      </p>
      <Modal
        open={!!mode}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        title={
          mode === "image"
            ? "Article images"
            : "Choose a book from your collection"
        }
      >
        {mode === "image" ? (
          <div className="space-y-4">
            <p>
              JPEG, PNG or WebP, up to 5 MB. Up to 20 uploads per article.
              Photos are resized and metadata is removed.
            </p>
            <label className="block">
              Image file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setSelected("");
                }}
                className="block max-w-full"
              />
            </label>
            <label className="block">
              Image description
              <input
                className="block w-full border border-ink-200 rounded p-2"
                value={alt}
                maxLength={300}
                disabled={busy}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
            <label className="block">
              Caption (optional)
              <input
                className="block w-full border border-ink-200 rounded p-2"
                value={caption}
                maxLength={500}
                disabled={busy}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            <Button loading={busy} onClick={insertImage}>
              Add image to draft
            </Button>
            {!!images.length && (
              <>
                <h3 className="font-display text-xl">Existing uploads</h3>
                <p className="text-sm">
                  Reuse an upload or remove one that is absent from both saved
                  and published versions.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {images.map((image, i) => (
                    <div
                      key={image.id}
                      className="space-y-2 border border-ink-200 rounded p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/article-images/${image.id}`}
                        alt={`Upload ${i + 1}`}
                        className="h-24 w-full object-contain"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        aria-pressed={selected === image.id}
                        onClick={() => {
                          setSelected(image.id);
                          setFile(null);
                        }}
                      >
                        Use upload {i + 1}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => remove(image.id)}
                      >
                        Remove upload {i + 1}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="space-y-2"
            >
              <label className="block">
                Search collection
                <input
                  className="block w-full border border-ink-200 rounded p-2"
                  value={q}
                  maxLength={160}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={busy}
                />
              </label>
              <Button loading={busy}>Search books</Button>
            </form>
            <p className="text-sm">
              Only the book title, author and catalogue cover are included.
              Private notes, ratings and reading history stay private.
            </p>
            {!busy && !books.length && (
              <p>No matching books in your collection.</p>
            )}
            {books.map((book) => (
              <Button
                key={book.editionId}
                variant="secondary"
                className="w-full h-auto py-3 text-left justify-start"
                disabled={busy}
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .insertContent([
                      { type: "bookCard", attrs: book },
                      { type: "paragraph" },
                    ])
                    .run();
                  setMode(null);
                }}
              >
                {book.title} / {book.authorName}
              </Button>
            ))}
            <div className="flex gap-3">
              {page > 1 && (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => search(page - 1)}
                >
                  Previous books
                </Button>
              )}
              {hasNext && (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => search(page + 1)}
                >
                  Next books
                </Button>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-rose-600">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
