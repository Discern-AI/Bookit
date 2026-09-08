import Link from "next/link";
import type { PathCardData } from "@/lib/path-data";
export function PathCard({ path }: { path: PathCardData }) {
  return (
    <Link
      href={`/path/${path.id}`}
      className="block bg-paper-100 rounded-md p-5 space-y-2 shadow-card hover:bg-paper-200"
    >
      <h3 className="font-display text-lg break-words">{path.title}</h3>
      <p className="text-sm text-ink-500 line-clamp-2 break-words">
        {path.description || "A reading journey, one book at a time."}
      </p>
      <p className="text-xs text-ink-500">
        {path._count.entries} books &middot; {path.user.name || "Folio reader"}{" "}
        &middot; {path.isPublic ? "Public" : "Private"}
      </p>
    </Link>
  );
}
