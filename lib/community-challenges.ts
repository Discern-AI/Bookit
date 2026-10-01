import { z } from "zod";
export const shareChallengeSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(0),
  isPublic: z.boolean(),
});
export const joinChallengeSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  version: z.number().int().min(0),
});
export const publicChallengeSelect = {
  id: true,
  title: true,
  kind: true,
  target: true,
  startsOn: true,
  endsOn: true,
  genre: true,
  shareVersion: true,
  squares: {
    select: { position: true, prompt: true },
    orderBy: { position: "asc" as const },
  },
} as const;
