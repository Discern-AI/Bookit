import { z } from "zod";
import type { Prisma } from "@prisma/client";
export const VIDEO_PLATFORMS = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  other: "Other / undecided",
};
export const VIDEO_STATUSES = {
  idea: "Idea",
  scripting: "Writing script",
  filming: "Filming",
  editing: "Editing",
  published: "Posted elsewhere",
};
export const videoProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    platform: z.enum(["youtube", "tiktok", "instagram", "other"]),
    status: z.enum(["idea", "scripting", "filming", "editing", "published"]),
    script: z.string().max(20000),
    notes: z.string().max(5000),
    publishedUrl: z.string().trim().max(2000),
    books: z
      .array(z.object({ workId: z.string().min(1).max(100) }))
      .min(1)
      .max(12),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.books.map((b) => b.workId)).size !== d.books.length)
      ctx.addIssue({ code: "custom", message: "Select each book once." });
    if (d.status !== "published") {
      if (d.publishedUrl)
        ctx.addIssue({
          code: "custom",
          message: "Only posted videos have a publication link.",
        });
    } else {
      try {
        const url = new URL(d.publishedUrl);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Add an http or https video link without login details.",
        });
      }
    }
  });
export const videoProjectAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
    project: videoProjectSchema,
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    version: z.number().int().min(1),
  }),
]);
export const videoProjectInclude = {
  books: {
    orderBy: { position: "asc" },
    include: { work: { select: { title: true, authorName: true } } },
  },
} as const satisfies Prisma.VideoProjectInclude;
export type VideoBook = { workId: string; title: string; authorName: string };
export type VideoDraft = Omit<z.infer<typeof videoProjectSchema>, "books">;
export type SavedVideoProject = VideoDraft & {
  id: string;
  version: number;
  books: VideoBook[];
};
export function serializeVideoProject(
  p: Prisma.VideoProjectGetPayload<{ include: typeof videoProjectInclude }>,
): SavedVideoProject {
  return {
    id: p.id,
    version: p.version,
    title: p.title,
    platform: p.platform as VideoDraft["platform"],
    status: p.status as VideoDraft["status"],
    script: p.script,
    notes: p.notes,
    publishedUrl: p.publishedUrl,
    books: p.books.map((b) => ({
      workId: b.workId,
      title: b.work.title,
      authorName: b.work.authorName,
    })),
  };
}
