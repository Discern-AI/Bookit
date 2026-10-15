import { z } from "zod";
import type { Prisma } from "@prisma/client";
export const shopDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    introduction: z.string().max(2000),
    isPublic: z.boolean(),
    entries: z
      .array(
        z.object({
          workId: z.string().min(1).max(100),
          note: z.string().max(1000),
          retailerUrl: z
            .string()
            .trim()
            .max(2000)
            .refine((value) => {
              if (!value) return true;
              try {
                const url = new URL(value);
                return (
                  url.protocol === "https:" && !url.username && !url.password
                );
              } catch {
                return false;
              }
            }, "Use an HTTPS retailer URL without login details."),
          affiliate: z.boolean(),
        }),
      )
      .max(20),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.entries.map((e) => e.workId)).size !== d.entries.length)
      ctx.addIssue({ code: "custom", message: "Choose each book once." });
    if (d.isPublic && !d.entries.length)
      ctx.addIssue({
        code: "custom",
        message: "Add a book before publishing.",
      });
    if (d.entries.some((e) => e.affiliate && !e.retailerUrl))
      ctx.addIssue({
        code: "custom",
        message: "Affiliate links need a retailer URL.",
      });
  });
export const shopSaveSchema = z.object({
  version: z.number().int().min(0),
  shop: shopDraftSchema,
});
export type ShopDraft = z.infer<typeof shopDraftSchema>;
export const shopInclude = {
  entries: {
    orderBy: { position: "asc" },
    include: { work: { select: { title: true, authorName: true } } },
  },
} as const satisfies Prisma.CuratorShopInclude;
export function shopData(
  shop: Prisma.CuratorShopGetPayload<{ include: typeof shopInclude }>,
) {
  return {
    version: shop.version,
    title: shop.title,
    introduction: shop.introduction,
    isPublic: shop.isPublic,
    entries: shop.entries.map((e) => ({
      workId: e.workId,
      note: e.note,
      retailerUrl: e.retailerUrl,
      affiliate: e.affiliate,
      title: e.work.title,
      authorName: e.work.authorName,
    })),
  };
}
