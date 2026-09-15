"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ArticleContent, articleTextClass } from "./ArticleContent";
import { ArticleNode, parseArticleContent } from "@/lib/articles";
type Draft = {
  id: string;
  title: string;
  excerpt: string;
  content: ArticleNode;
  version: number;
  isPublic: boolean;
  publishedVersion: number | null;
};
export function ArticleEditor({ initial }: { initial: Draft }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [content, setContent] = useState(initial.content);
  const [version, setVersion] = useState(initial.version);
  const [published, setPublished] = useState(initial.isPublic);
  const [publishedVersion, setPublishedVersion] = useState(
    initial.publishedVersion,
  );
  const [baseline, setBaseline] = useState(
    JSON.stringify([initial.title, initial.excerpt, initial.content]),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [action, setAction] = useState<
    "publish" | "unpublish" | "delete" | "leave" | null
  >(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: false,
        underline: false,
      }),
    ],
    immediatelyRender: false,
    content: initial.content,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Article body",
        class: `${articleTextClass} min-h-64 p-4 focus:outline-shelf-700`,
      },
    },
    onUpdate: ({ editor }) => setContent(editor.getJSON() as ArticleNode),
  });
  useEffect(() => {
    editor?.setEditable(!busy);
  }, [editor, busy]);
  const dirty = JSON.stringify([title, excerpt, content]) !== baseline;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function request(method: string, payload: unknown) {
    const response = await fetch(`/api/articles/${initial.id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save article.");
    return data;
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const normalized = parseArticleContent(content);
      const data = await request("PUT", {
        title,
        excerpt,
        content: normalized,
        version,
      });
      setVersion(data.version);
      setBaseline(JSON.stringify([title, excerpt, content]));
      setMessage("Draft saved. Publish when you are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (action === "leave") {
      router.push("/creator");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data = await request("POST", { action, version });
      if (action === "delete") {
        router.push("/creator");
        router.refresh();
        return;
      }
      setVersion(data.version);
      setPublished(data.isPublic);
      setPublishedVersion(data.publishedVersion);
      setMessage(
        action === "publish" ? "Article published." : "Article unpublished.",
      );
      setAction(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update.");
      setAction(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-5">
      <Button
        variant="link"
        onClick={() => (dirty ? setAction("leave") : router.push("/creator"))}
      >
        Back to your articles
      </Button>
      <h1 className="font-display text-3xl">Article editor</h1>
      <p>
        {published
          ? publishedVersion === version
            ? "Published version is up to date."
            : "Published with saved draft changes."
          : "Private draft"}
        {dirty ? " / Unsaved changes" : ""}
      </p>
      <label className="block">
        Title
        <input
          className="block w-full border border-ink-200 rounded p-3"
          value={title}
          maxLength={160}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        Summary (optional)
        <textarea
          className="block w-full border border-ink-200 rounded p-3"
          value={excerpt}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setExcerpt(e.target.value)}
        />
      </label>
      <div
        className="flex flex-wrap gap-2"
        role="toolbar"
        aria-label="Article formatting"
      >
        {(
          [
            ["Bold", () => editor?.chain().focus().toggleBold().run()],
            ["Italic", () => editor?.chain().focus().toggleItalic().run()],
            [
              "Heading",
              () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
            ],
            [
              "Bullet list",
              () => editor?.chain().focus().toggleBulletList().run(),
            ],
            [
              "Numbered list",
              () => editor?.chain().focus().toggleOrderedList().run(),
            ],
            ["Quote", () => editor?.chain().focus().toggleBlockquote().run()],
            ["Undo", () => editor?.chain().focus().undo().run()],
            ["Redo", () => editor?.chain().focus().redo().run()],
          ] as [string, () => unknown][]
        ).map(([label, run]) => (
          <Button
            key={label}
            size="sm"
            variant="secondary"
            disabled={busy || !editor}
            onClick={run}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="border border-ink-200 rounded">
        <EditorContent editor={editor} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button loading={busy} onClick={save}>
          Save draft
        </Button>
        <Button variant="secondary" onClick={() => setPreview(!preview)}>
          {preview ? "Close preview" : "Preview"}
        </Button>
        <Button
          disabled={busy || dirty || version === 0}
          onClick={() => setAction("publish")}
        >
          {published ? "Publish changes" : "Publish article"}
        </Button>
        {published && (
          <Button
            variant="secondary"
            disabled={busy || dirty}
            onClick={() => setAction("unpublish")}
          >
            Unpublish
          </Button>
        )}
        {version > 0 && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => setAction("delete")}
          >
            Delete article
          </Button>
        )}
      </div>
      <p className="text-sm text-ink-500">
        Save your draft before publishing. Editing a published article keeps the
        current public version visible until you publish again.
      </p>
      {message && <p role="status">{message}</p>}
      {preview && (
        <section
          aria-label="Article preview"
          className="border-t border-ink-200 pt-5"
        >
          <h2 className="font-display text-3xl mb-4">{title}</h2>
          <ArticleContent content={content} />
        </section>
      )}
      <Modal
        open={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={
          action === "leave"
            ? "Discard unsaved changes?"
            : action === "delete"
              ? "Delete article?"
              : action === "unpublish"
                ? "Unpublish article?"
                : "Publish saved draft?"
        }
      >
        <p className="mb-4">
          {action === "leave"
            ? "Your unsaved edits will be lost."
            : action === "delete"
              ? "This permanently clears the article and removes its public page."
              : action === "unpublish"
                ? "The public page and listings will be hidden. Your draft remains saved."
                : "Anyone can read this saved version when your blog and profile are public."}
        </p>
        <Button loading={busy} onClick={confirm}>
          Confirm {action}
        </Button>
      </Modal>
    </main>
  );
}
