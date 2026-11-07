import { z } from "zod";

export const budgetTiers = [
  "make_do",
  "comfortable",
  "collector",
  "dream",
] as const;
export const readingKitItemKinds = [
  "reading_object",
  "atmosphere",
  "food_drink",
  "resource",
] as const;
const optionalPublicUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use a public http or https link without login details.");

export function buildSensoryProfile(
  budgetTier: string,
  hasMakeDo: boolean,
  hasBooks: boolean,
) {
  const base =
    budgetTier === "make_do" || hasMakeDo
      ? [
          "Soft existing lamp",
          "Quiet, familiar soundtrack or silence",
          "Use the nearest comfortable seat and a reuseable drink vessel",
        ]
      : budgetTier === "dream"
        ? [
            "Warm dimmable lighting",
            "Instrumental or ambient soundscape at low volume",
            "A favourite blanket and a prepared drink or snack",
          ]
        : [
            "Warm table or floor lamp",
            "Low-volume quiet music or silence",
            "Comfortable seat, nearby water and one tactile bookmark",
          ];
  if (hasBooks)
    base.push("Keep the selected book and the next possible book nearby");
  return base.join(". ") + ".";
}
export const readingKitSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    notes: z.string().trim().max(2000).default(""),
    makeDo: z.string().trim().max(1000).default(""),
    sensoryProfile: z.string().trim().max(1000).default(""),
    creatorEssay: z.string().trim().max(6000).default(""),
    playlistUrl: optionalPublicUrl.default(""),
    suggestedOrder: z.string().trim().max(2000).default(""),
    publicDescription: z.string().trim().max(1000).default(""),
    budgetTier: z.enum(budgetTiers).default("comfortable"),
    isPublic: z.boolean().default(false),
    entries: z
      .array(
        z.object({
          workId: z.string().min(1).max(100),
          note: z.string().trim().max(500).default(""),
        }),
      )
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((item) => item.workId)).size === items.length,
        "Choose each book once.",
      ),
    items: z
      .array(
        z.object({
          kind: z.enum(readingKitItemKinds),
          title: z.string().trim().min(2).max(120),
          details: z.string().trim().max(500).default(""),
          externalUrl: optionalPublicUrl.default(""),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((kit, ctx) => {
    if (kit.isPublic && kit.publicDescription.length < 10)
      ctx.addIssue({
        code: "custom",
        path: ["publicDescription"],
        message: "Add a public description of at least 10 characters.",
      });
    if (kit.isPublic && !kit.entries.length && !kit.items.length)
      ctx.addIssue({
        code: "custom",
        message: "A public kit needs at least one book or package item.",
      });
  });
