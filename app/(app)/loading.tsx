export default function Loading() {
  return (
    <div className="max-w-4xl w-full mx-auto p-8 space-y-4" role="status">
      <span className="sr-only">Opening your books</span>
      <div className="h-10 w-56 bg-ink-200 animate-pulse rounded" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-28 bg-paper-200 animate-pulse rounded-md" />
      ))}
    </div>
  );
}
