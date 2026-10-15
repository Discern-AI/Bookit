import { z } from "zod";
export const READING_TIMES = [
  "Morning commute",
  "Lunch",
  "Evenings",
  "Weekends",
  "Before bed",
  "Whenever I can",
] as const;
export const READING_BUDGETS = [
  "Not specified",
  "Under 30 minutes",
  "30-60 minutes",
  "1-2 hours",
  "As long as I like",
] as const;
export const contextProfileSchema = z.object({
  lifeContext: z.string().max(5000),
  readingTimes: z
    .array(z.enum(READING_TIMES))
    .max(6)
    .refine((a) => new Set(a).size === a.length)
    .transform((a) => READING_TIMES.filter((t) => a.includes(t))),
  timeAvailable: z.enum(READING_BUDGETS),
});
export type ContextProfile = z.infer<typeof contextProfileSchema>;
export const emptyContext: ContextProfile = {
  lifeContext: "",
  readingTimes: [],
  timeAvailable: "Not specified",
};
export const contextActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    version: z.number().int().min(0),
    profile: contextProfileSchema,
  }),
  z.object({ action: z.literal("delete"), version: z.number().int().min(0) }),
]);
