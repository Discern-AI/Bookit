import { z } from "zod";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  });
export const challengeSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    target: z.number().int().min(1).max(10000),
    startsOn: day,
    endsOn: day,
    genre: z.string().trim().max(100).nullable(),
  })
  .refine((v) => v.startsOn <= v.endsOn, {
    message: "Finish must follow start.",
  });
export type Completion = {
  workId: string;
  userBookId: string;
  cycleId: string | null;
  title: string;
  genres: string[];
  date: string;
};
export function challengeMatches(
  c: { startsOn: string; endsOn: string; genre: string | null },
  reads: Completion[],
) {
  return reads.filter(
    (r) =>
      r.date >= c.startsOn &&
      r.date <= c.endsOn &&
      (!c.genre ||
        r.genres.some((g) => g.toLowerCase() === c.genre!.toLowerCase())),
  );
}
