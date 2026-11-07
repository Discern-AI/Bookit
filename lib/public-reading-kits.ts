import { budgetTiers } from "./reading-kit";

export type PublicKitFilters = {
  q: string;
  budget: (typeof budgetTiers)[number] | "all";
  content: "all" | "books" | "items";
  cursor: { publishedAt: Date; id: string } | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodePublicKitCursor(publishedAt: Date, id: string) {
  return Buffer.from(`${publishedAt.toISOString()}|${id}`, "utf8").toString(
    "base64url",
  );
}

export function decodePublicKitCursor(value: string | undefined) {
  if (!value || value.length > 160) return null;
  try {
    const [rawDate, id, extra] = Buffer.from(value, "base64url")
      .toString("utf8")
      .split("|");
    const publishedAt = new Date(rawDate);
    if (extra || !uuidPattern.test(id) || Number.isNaN(publishedAt.getTime()))
      return null;
    return { publishedAt, id };
  } catch {
    return null;
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePublicKitFilters(
  params: Record<string, string | string[] | undefined>,
): PublicKitFilters {
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const rawBudget = first(params.budget) ?? "all";
  const budget = budgetTiers.includes(rawBudget as (typeof budgetTiers)[number])
    ? (rawBudget as (typeof budgetTiers)[number])
    : "all";
  const rawContent = first(params.content);
  const content =
    rawContent === "books" || rawContent === "items" ? rawContent : "all";
  return {
    q,
    budget,
    content,
    cursor: decodePublicKitCursor(first(params.cursor)),
  };
}

export function publicKitQuery(filters: PublicKitFilters, cursor?: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.budget !== "all") params.set("budget", filters.budget);
  if (filters.content !== "all") params.set("content", filters.content);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/community/kits?${query}` : "/community/kits";
}
