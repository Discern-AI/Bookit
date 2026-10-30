import { z } from "zod";

export const budgetTiers = ["make_do", "comfortable", "collector", "dream"] as const;

export function buildSensoryProfile(budgetTier: string, hasMakeDo: boolean, hasBooks: boolean) {
  const base = budgetTier === "make_do" || hasMakeDo
    ? ["Soft existing lamp", "Quiet, familiar soundtrack or silence", "Use the nearest comfortable seat and a reuseable drink vessel"]
    : budgetTier === "dream"
      ? ["Warm dimmable lighting", "Instrumental or ambient soundscape at low volume", "A favourite blanket and a prepared drink or snack"]
      : ["Warm table or floor lamp", "Low-volume quiet music or silence", "Comfortable seat, nearby water and one tactile bookmark"];
  if (hasBooks) base.push("Keep the selected book and the next possible book nearby");
  return base.join(". ") + ".";
}
export const readingKitSchema = z.object({
  title: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(2000).default(""),
  makeDo: z.string().trim().max(1000).default(""),
  sensoryProfile: z.string().trim().max(1000).default(""),
  budgetTier: z.enum(budgetTiers).default("comfortable"),
  isPublic: z.boolean().default(false),
  entries: z.array(z.object({
    workId: z.string().min(1).max(100),
    note: z.string().trim().max(500).default(""),
  })).max(20).refine((items) => new Set(items.map((item) => item.workId)).size === items.length, "Choose each book once."),
});
