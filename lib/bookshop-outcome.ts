import { z } from "zod";

export const bookshopOutcomes = ["saved_search", "planned_visit", "visited", "asked_about", "found_copy", "unavailable", "ordered_elsewhere"] as const;
export const bookshopOutcomeSchema = z.object({
  workId: z.string().min(1).max(100).nullable().default(null),
  shopName: z.string().trim().max(160).default(""),
  outcome: z.enum(bookshopOutcomes),
  notes: z.string().trim().max(2000).default(""),
  externalUrl: z.string().trim().max(500).default(""),
  visitedAt: z.string().datetime().nullable().optional(),
});

export function safeExternalMapUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("google.com") ? url.toString() : null;
  } catch { return null; }
}
