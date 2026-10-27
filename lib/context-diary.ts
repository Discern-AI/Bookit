import { z } from "zod";
export const diaryText = z.string().trim().min(1).max(10000);
export const diaryAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
    contextVersion: z.number().int().min(0),
    text: diaryText,
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    version: z.number().int().min(1),
    contextVersion: z.number().int().min(0),
  }),
]);
export const diaryBinding = (userId: string, id: string) =>
  "diary:" + JSON.stringify([userId, id]);
export type DiaryEntry = {
  id: string;
  version: number;
  createdAt: string;
  text: string | null;
};
