import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { ShareCardBook } from "./share-cards";
export const cardProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(["book", "quote", "shelfie"]),
    format: z.enum(["square", "portrait"]),
    theme: z.enum(["paper", "night"]),
    caption: z.string().max(180),
    quote: z.string().max(500),
    reference: z.string().max(40),
    heading: z.string().max(60),
    includeByline: z.boolean(),
    books: z
      .array(
        z.object({
          workId: z.string().min(1).max(100),
          editionId: z.string().min(1).max(100),
        }),
      )
      .min(1)
      .max(6),
  })
  .refine(
    (d) =>
      (d.kind === "shelfie" || d.books.length === 1) &&
      new Set(d.books.map((b) => b.workId)).size === d.books.length,
    "Choose one book, or up to six distinct shelfie books.",
  );
export const cardProjectAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
    project: cardProjectSchema,
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    version: z.number().int().min(1),
  }),
]);
export const cardProjectInclude = {
  books: {
    orderBy: { position: "asc" },
    include: { work: { select: { title: true, authorName: true } } },
  },
} as const satisfies Prisma.CardProjectInclude;
export type SavedCardProject = Omit<
  z.infer<typeof cardProjectSchema>,
  "books"
> & { id: string; version: number; books: ShareCardBook[] };
export function serializeCardProject(
  p: Prisma.CardProjectGetPayload<{ include: typeof cardProjectInclude }>,
): SavedCardProject {
  return {
    id: p.id,
    version: p.version,
    title: p.title,
    kind: p.kind as SavedCardProject["kind"],
    format: p.format as SavedCardProject["format"],
    theme: p.theme as SavedCardProject["theme"],
    caption: p.caption,
    quote: p.quote,
    reference: p.reference,
    heading: p.heading,
    includeByline: p.includeByline,
    books: p.books.map((b) => ({
      workId: b.workId,
      editionId: b.editionId,
      title: b.work.title,
      authorName: b.work.authorName,
      coverUrl: "",
    })),
  };
}
