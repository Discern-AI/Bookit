import { z } from "zod";
import { validDate, localDate } from "./reading";
const date = z
  .string()
  .refine(
    (v) => validDate(v) && v >= "1900-01-01" && v <= "2200-12-31",
    "Enter a real date between 1900 and 2200.",
  );
export const occasionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(100),
  date,
  annual: z.boolean(),
  dismissedFor: date.nullable().default(null),
});
export const giftSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    tasteNotes: z.string().trim().max(5000),
    budgetPence: z.number().int().min(0).max(99999999).nullable(),
    occasions: z.array(occasionSchema).max(20),
    items: z
      .array(
        z.object({
          workId: z.string().min(1).max(100),
          status: z.enum(["planned", "bought", "given"]),
          priority: z.enum(["perfect_fit", "might_like", "wildcard"]),
          pricePence: z.number().int().min(0).max(99999999).nullable(),
          note: z.string().trim().max(2000),
        }),
      )
      .max(100),
  })
  .refine(
    (g) => new Set(g.items.map((i) => i.workId)).size === g.items.length,
    "Each book can appear once.",
  )
  .refine(
    (g) => new Set(g.occasions.map((o) => o.id)).size === g.occasions.length,
    "Occasions must be unique.",
  );
export type GiftInput = z.infer<typeof giftSchema>;
export type Occasion = z.infer<typeof occasionSchema>;
export function readOccasions(value: unknown): Occasion[] {
  const parsed = z.array(occasionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}
export function parsePounds(value: string): number | null | undefined {
  const s = value.trim();
  if (!s) return null;
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)) return undefined;
  const [whole, fraction = ""] = s.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function pounds(value: number | null) {
  return value === null
    ? "Not set"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(value / 100);
}
export function nextOccasion(occasion: Occasion, today = localDate()) {
  if (!validDate(today) || !validDate(occasion.date)) return null;
  let occurrence = occasion.date;
  if (occasion.annual) {
    let year = Math.max(
      Number(today.slice(0, 4)),
      Number(occasion.date.slice(0, 4)),
    );
    const inYear = (y: number) => {
      const candidate = `${y}-${occasion.date.slice(5)}`;
      return validDate(candidate) ? candidate : `${y}-02-28`;
    };
    occurrence = inYear(year);
    if (occurrence < today) occurrence = inYear(++year);
  }
  if (occurrence < today) return null;
  return {
    ...occasion,
    occurrence,
    days: Math.round(
      (Date.parse(`${occurrence}T12:00:00Z`) -
        Date.parse(`${today}T12:00:00Z`)) /
        86400000,
    ),
  };
}
export const GIFT_PRIORITY = {
  perfect_fit: "Perfect fit",
  might_like: "Might like",
  wildcard: "Wildcard",
};
