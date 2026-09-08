import { z } from "zod";
export const pathSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000),
    isPublic: z.boolean(),
    entries: z
      .array(
        z.object({
          workId: z.string().min(1).max(100),
          note: z.string().trim().max(2000),
        }),
      )
      .max(100),
  })
  .refine(
    (p) => new Set(p.entries.map((e) => e.workId)).size === p.entries.length,
    "Each work can appear only once.",
  )
  .refine(
    (p) => !p.isPublic || p.entries.length > 0,
    "Add at least one book before publishing.",
  );
export type PathInput = z.infer<typeof pathSchema>;
