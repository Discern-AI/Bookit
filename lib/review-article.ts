import { parseArticleContent, ArticleNode } from "./articles";
export function reviewArticleContent(body: string): ArticleNode {
  // Literal text, never HTML or executable markup; retain paragraph boundaries.
  return parseArticleContent({
    type: "doc",
    content: body
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text: text.replace(/\r?\n/g, " ") }],
      })),
  });
}
