// Skeleton loader — Implementation Brief §2.9.
// Match the exact shape of the real content it stands in for.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={["relative overflow-hidden bg-ink-200", className].join(" ")}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}
