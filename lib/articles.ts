import { z } from "zod";
export type ArticleNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: ArticleNode[];
};
export const emptyArticle: ArticleNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const nodeSchema = z
  .object({
    type: z.enum([
      "doc",
      "paragraph",
      "heading",
      "text",
      "hardBreak",
      "horizontalRule",
      "blockquote",
      "bulletList",
      "orderedList",
      "listItem",
      "articleImage",
      "bookCard",
    ]),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z
      .array(
        z
          .object({ type: z.enum(["bold", "italic", "strike", "code"]) })
          .strict(),
      )
      .max(4)
      .optional(),
    content: z.array(z.unknown()).max(5000).optional(),
  })
  .strict();
export function parseArticleContent(input: unknown): ArticleNode {
  let count = 0;
  let length = 0;
  function visit(value: unknown, depth: number): ArticleNode {
    if (depth > 12 || ++count > 5000)
      throw new Error("Article structure is too large.");
    const node = nodeSchema.parse(value);
    const attrs = node.attrs ?? {};
    const keys = Object.keys(attrs);
    if (node.type === "articleImage") {
      z.object({
        imageId: z.string().uuid(),
        alt: z.string().trim().min(1).max(300),
        caption: z.string().max(500),
      })
        .strict()
        .parse(attrs);
    } else if (node.type === "bookCard") {
      z.object({
        editionId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        workId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        title: z.string().min(1).max(500),
        authorName: z.string().max(500),
        coverUrl: z.string().max(500),
      })
        .strict()
        .parse(attrs);
      if (
        attrs.coverUrl &&
        !/^https:\/\/covers\.openlibrary\.org\/[^?#]+$/.test(
          String(attrs.coverUrl),
        )
      )
        throw new Error("Unsupported book cover.");
    } else if (node.type === "heading") {
      if (
        keys.some((k) => k !== "level") ||
        ![2, 3].includes(attrs.level as number)
      )
        throw new Error("Unsupported heading.");
    } else if (node.type === "orderedList") {
      if (
        keys.some((k) => !["start", "type"].includes(k)) ||
        (attrs.start !== undefined &&
          (!Number.isInteger(attrs.start) ||
            Number(attrs.start) < 1 ||
            Number(attrs.start) > 100000)) ||
        (attrs.type != null &&
          !["1", "a", "A", "i", "I"].includes(String(attrs.type)))
      )
        throw new Error("Unsupported list attributes.");
    } else if (keys.length) throw new Error("Unsupported attributes.");
    if (node.type === "text") {
      if (!node.text || node.content || keys.length)
        throw new Error("Invalid text node.");
      length += node.text.length;
      if (length > 50000)
        throw new Error("Articles can contain up to 50,000 characters.");
      return node as ArticleNode;
    }
    if (node.text !== undefined || node.marks?.length)
      throw new Error("Invalid text or marks.");
    const children = (node.content ?? []).map((child) =>
      visit(child, depth + 1),
    );
    const types = children.map((child) => child.type);
    const blocks = [
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "horizontalRule",
      "articleImage",
      "bookCard",
    ];
    if (node.type === "doc" && depth !== 0)
      throw new Error("Nested documents are not supported.");
    if (
      ["doc", "blockquote"].includes(node.type) &&
      (!children.length || types.some((t) => !blocks.includes(t)))
    )
      throw new Error("Invalid block structure.");
    if (
      ["paragraph", "heading"].includes(node.type) &&
      types.some((t) => !["text", "hardBreak"].includes(t))
    )
      throw new Error("Invalid inline structure.");
    if (
      ["bulletList", "orderedList"].includes(node.type) &&
      (!children.length || types.some((t) => t !== "listItem"))
    )
      throw new Error("Invalid list.");
    if (
      node.type === "listItem" &&
      (types[0] !== "paragraph" || types.some((t) => !blocks.includes(t)))
    )
      throw new Error("Invalid list item.");
    if (
      ["hardBreak", "horizontalRule", "articleImage", "bookCard"].includes(
        node.type,
      ) &&
      children.length
    )
      throw new Error("Invalid break.");
    return {
      ...node,
      ...(children.length ? { content: children } : { content: undefined }),
    } as ArticleNode;
  }
  const result = visit(input, 0);
  if (result.type !== "doc")
    throw new Error("An article document is required.");
  if (
    articleNodes(result, "articleImage").length > 20 ||
    articleNodes(result, "bookCard").length > 20
  )
    throw new Error("Use at most 20 images and 20 book cards per article.");
  return JSON.parse(JSON.stringify(result)) as ArticleNode;
}
export function articleText(node: ArticleNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const value = (node.content ?? []).map(articleText).join("");
  return ["paragraph", "heading"].includes(node.type) ? value + "\n" : value;
}
export const articleDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(500),
  content: z.unknown(),
  version: z.number().int().min(0),
});
export const articleActionSchema = z.object({
  action: z.enum(["publish", "unpublish", "delete"]),
  version: z.number().int().min(1),
});
export const publishedArticles = {
  isHidden: false,
  isPublic: true,
  deletedAt: null,
  user: { profilePublic: true, blogEnabled: true },
};
export const articleCardSelect = {
  id: true,
  publishedTitle: true,
  publishedExcerpt: true,
  publishedAt: true,
  publishedReadMinutes: true,
  user: { select: { publicName: true, username: true } },
};
export function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function articleNodes(node: ArticleNode, type: string): ArticleNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content ?? []).flatMap((child) => articleNodes(child, type)),
  ];
}

// PostgreSQL JSONB and editor schemas may serialize object keys differently.
// Compare document values without treating key order as an edit.
export function articleFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
