import type { Prisma } from "@prisma/client";
import { readOccasions } from "./gifts";
export const giftInclude = {
  giftItems: {
    orderBy: { id: "asc" },
    include: {
      claimedBy: { select: { name: true } },
      work: { select: { id: true, title: true, authorName: true } },
    },
  },
} satisfies Prisma.GiftContactInclude;
export function serializeGift(
  contact: Prisma.GiftContactGetPayload<{ include: typeof giftInclude }>,
) {
  return {
    id: contact.id,
    name: contact.name,
    tasteNotes: contact.tasteNotes,
    budgetPence: contact.budgetPence,
    version: contact.version,
    occasions: readOccasions(contact.occasions),
    items: contact.giftItems.map((i) => ({
      workId: i.workId,
      status: i.status as "planned" | "bought" | "given",
      priority: i.priority as "perfect_fit" | "might_like" | "wildcard",
      pricePence: i.pricePence,
      note: i.note,
      work: i.work,
    })),
  };
}
export type GiftData = ReturnType<typeof serializeGift>;
