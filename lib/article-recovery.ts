import { z } from "zod";
import { parseArticleContent } from "./articles";
export function parseArticleRecovery(raw: string, now = Date.now()) {
  if (raw.length > 350000) throw new Error("Recovery copy is too large.");
  const value = z
    .object({
      version: z.number().int().min(0),
      title: z.string().max(160),
      excerpt: z.string().max(500),
      content: z.unknown(),
      updatedAt: z.number().int(),
    })
    .strict()
    .parse(JSON.parse(raw));
  if (
    value.updatedAt > now + 60000 ||
    now - value.updatedAt > 7 * 24 * 60 * 60 * 1000
  )
    throw new Error("Recovery copy expired.");
  return { ...value, content: parseArticleContent(value.content) };
}
export type ArticleRecoveryCopy = ReturnType<typeof parseArticleRecovery>;
