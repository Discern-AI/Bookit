import { z } from "zod";
import { budgetTiers } from "./reading-kit";

export const marketplaceKinds = ["book", "reading_object"] as const;
export const marketplaceCategories = [
  "books_collecting",
  "reading_objects",
] as const;

const externalUrl = z
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

export const marketplaceListingSchema = z
  .object({
    kind: z.enum(marketplaceKinds),
    category: z.enum(marketplaceCategories),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).default(""),
    makeDoAlternative: z.string().trim().min(3).max(1000),
    budgetTier: z.enum(budgetTiers),
    pricePence: z.number().int().min(0).max(100_000_000).nullable(),
    externalUrl,
    workId: z.string().min(1).max(100).nullable(),
    isPublished: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isPublished && !value.externalUrl)
      ctx.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message: "Add an external purchase link before publishing.",
      });
    if (value.kind === "book" && !value.workId)
      ctx.addIssue({
        code: "custom",
        path: ["workId"],
        message: "Choose a library book for a book listing.",
      });
    if (value.kind === "reading_object" && value.category !== "reading_objects")
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Reading objects must use the Reading objects category.",
      });
    if (value.kind === "book" && value.category !== "books_collecting")
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Books must use the Books & collecting category.",
      });
  });

export function marketplaceUrl(value: string) {
  return externalUrl.safeParse(value).success;
}
