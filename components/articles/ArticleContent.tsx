import { createElement, Fragment, type ReactNode } from "react";
import type { ArticleNode } from "@/lib/articles";
export const articleTextClass =
  "space-y-4 break-words [&_h2]:font-display [&_h2]:text-3xl [&_h3]:font-display [&_h3]:text-2xl [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:bg-ink-50 [&_code]:px-1 [&_hr]:border-ink-200";
export function ArticleContent({ content }: { content: ArticleNode }) {
  function render(node: ArticleNode, key: number): ReactNode {
    if (node.type === "text") {
      let text: ReactNode = node.text ?? "";
      for (const mark of node.marks ?? [])
        text = createElement(
          (
            {
              bold: "strong",
              italic: "em",
              strike: "s",
              code: "code",
            } as Record<string, string>
          )[mark.type] ?? "span",
          null,
          text,
        );
      return <Fragment key={key}>{text}</Fragment>;
    }
    if (node.type === "articleImage")
      return (
        <figure key={key} className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/article-images/${encodeURIComponent(String(node.attrs!.imageId))}`}
            alt={String(node.attrs!.alt)}
            loading="lazy"
            className="max-w-full max-h-[40rem] mx-auto rounded"
          />
          {node.attrs!.caption ? (
            <figcaption className="text-sm text-ink-500">
              {String(node.attrs!.caption)}
            </figcaption>
          ) : null}
        </figure>
      );
    if (node.type === "bookCard")
      return (
        <a
          key={key}
          href={`/book/${encodeURIComponent(String(node.attrs!.workId))}`}
          className="flex gap-4 rounded border border-ink-200 p-4"
        >
          {node.attrs!.coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={String(node.attrs!.coverUrl)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-16 h-24 object-contain"
              />
            </>
          ) : null}
          <span>
            <span className="block font-display text-xl underline">
              {String(node.attrs!.title)}
            </span>
            <span className="block text-ink-500">
              {String(node.attrs!.authorName)}
            </span>
          </span>
        </a>
      );
    const tags: Record<string, string> = {
      doc: "div",
      paragraph: "p",
      heading: node.attrs?.level === 3 ? "h3" : "h2",
      hardBreak: "br",
      horizontalRule: "hr",
      blockquote: "blockquote",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
    };
    const tag = tags[node.type];
    if (!tag) return null;
    const props = {
      key,
      ...(node.type === "orderedList"
        ? {
            start: Number(node.attrs?.start ?? 1),
            type: node.attrs?.type ?? undefined,
          }
        : {}),
    };
    return node.type === "hardBreak" || node.type === "horizontalRule"
      ? createElement(tag, props)
      : createElement(tag, props, (node.content ?? []).map(render));
  }
  return (
    <div className={articleTextClass}>
      {content.type === "doc"
        ? (content.content ?? []).map(render)
        : render(content, 0)}
    </div>
  );
}
