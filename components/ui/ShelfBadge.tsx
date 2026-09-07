import { SHELF_BADGE_CLASS, SHELF_LABEL, ShelfKey } from "@/lib/shelves";

// ShelfBadge — Implementation Brief §2.4.

export function ShelfBadge({
  shelf,
  className = "",
}: {
  shelf: ShelfKey;
  className?: string;
}) {
  return (
    <span
      className={[
        "text-xs font-medium px-2 py-0.5 rounded-full inline-block w-fit",
        SHELF_BADGE_CLASS[shelf],
        className,
      ].join(" ")}
    >
      {SHELF_LABEL[shelf]}
    </span>
  );
}
