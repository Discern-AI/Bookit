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
    kind: z.enum(["count", "bingo"]).default("count"),
    prompts: z.array(z.string().trim().min(1).max(160)).length(9).optional(),
    title: z.string().trim().min(1).max(120),
    target: z.number().int().min(1).max(10000),
    startsOn: day,
    endsOn: day,
    genre: z.string().trim().max(100).nullable(),
  })
  .refine((v) => v.startsOn <= v.endsOn, {
    message: "Finish must follow start.",
  })
  .refine(
    (v) =>
      v.kind === "bingo"
        ? !!v.prompts && v.target === 9 && v.genre === null
        : !v.prompts,
    {
      message:
        "Bingo requires nine prompts, a target of nine and no genre filter.",
    },
  );
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

export const squareSchema = z.object({
  id: z.string().uuid(),
  squareId: z.string().min(1).max(100),
  version: z.number().int().min(0),
  workId: z.string().min(1).max(100).nullable(),
});
export function bingoLines(completed: boolean[]) {
  if (completed.length !== 9) return 0;
  return [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ].filter((line) => line.every((i) => completed[i])).length;
}
