import { z } from "zod";
export const entrySchema = z
  .object({
    id: z.string().uuid(),
    workId: z.string().min(1).nullable(),
    kind: z.enum(["note", "link", "chat"]),
    text: z.string().trim().min(1).max(12000),
    url: z.string().max(2000).optional(),
    role: z.enum(["user", "assistant"]).optional(),
    conversationId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.kind === "chat"
        ? !v.role || !v.conversationId || v.url
        : !v.workId || v.role || v.conversationId
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a book and valid entry type.",
      });
    if (v.kind === "link") {
      try {
        const url = new URL(v.url ?? "");
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Use a public http or https link without login details.",
        });
      }
    } else if (v.url)
      ctx.addIssue({ code: "custom", message: "Only links have a URL." });
  });
export type JournalEntry = {
  id: string;
  workId: string | null;
  kind: string;
  role: string | null;
  text: string;
  url: string | null;
  version: number;
  createdAt: string;
  conversationId: string | null;
};
// Match whole titles only, never fuzzy guesses. Ambiguous or very short titles stay unfiled.
export function mentionedWork(
  text: string,
  works: { id: string; title: string }[],
) {
  const normalize = (s: string) =>
    s
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const message = ` ${normalize(text)} `;
  const matches = [
    ...new Set(
      works
        .filter(
          (w) =>
            normalize(w.title).length >= 4 &&
            message.includes(` ${normalize(w.title)} `),
        )
        .map((w) => w.id),
    ),
  ];
  return matches.length === 1 ? matches[0] : null;
}
export function sameOriginJson(request: Request) {
  return (
    request.headers.get("content-type")?.startsWith("application/json") &&
    (!request.headers.get("origin") ||
      request.headers.get("origin") === new URL(request.url).origin)
  );
}
