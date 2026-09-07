// Shelf metadata per Implementation Brief §2.4 (badge) and §3.1 (default shelves).

export const SHELVES = [
  "reading_now",
  "read",
  "tbr",
  "owned_unread",
  "wishlist",
  "not_for_me",
  "dnf",
  "interested",
  "lent_out",
  "reference",
] as const;

export type ShelfKey = (typeof SHELVES)[number];

export const SHELF_LABEL: Record<ShelfKey, string> = {
  reading_now: "Reading now",
  read: "Read",
  tbr: "Want to read",
  owned_unread: "Owned, unread",
  wishlist: "Wishlist",
  not_for_me: "Not for me",
  dnf: "Did not finish",
  interested: "Interested",
  lent_out: "Lent out",
  reference: "Reference",
};

export const SHELF_BADGE_CLASS: Record<ShelfKey, string> = {
  reading_now: "bg-shelf-100 text-shelf-700",
  read: "bg-sage-100 text-sage-600",
  tbr: "bg-amber-100 text-amber-600",
  owned_unread: "bg-ink-50 text-ink-500",
  wishlist: "bg-paper-200 text-ink-800",
  not_for_me: "bg-ink-50 text-ink-500",
  dnf: "bg-rose-100 text-rose-600",
  interested: "bg-paper-200 text-ink-800",
  lent_out: "bg-amber-100 text-amber-600",
  reference: "bg-paper-200 text-ink-800",
};

export const SHELF_EMPTY_COPY: Record<ShelfKey, string> = {
  tbr: "Nothing on your list yet. The chat can help you find what's next.",
  read: "You haven't logged a finished book yet. Add one and it will live here.",
  reading_now: "Nothing here yet. Add a book and mark it as reading now.",
  owned_unread: "Nothing here yet. Books you own but haven't started will show up here.",
  wishlist: "Nothing here yet. Books you'd like to buy will show up here.",
  not_for_me: "Nothing here yet.",
  dnf: "Nothing here yet.",
  interested: "Nothing here yet. Books on your radar will show up here.",
  lent_out: "Nothing here yet. Books you've lent out will show up here.",
  reference: "Nothing here yet.",
};
