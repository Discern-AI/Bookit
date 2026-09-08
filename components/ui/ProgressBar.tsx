export function ProgressBar({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number | null;
}) {
  const percent = totalPages
    ? Math.min(100, Math.max(0, (currentPage / totalPages) * 100))
    : 0;
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={currentPage}
        aria-valuemin={0}
        aria-valuemax={totalPages ?? undefined}
        className="h-1 bg-ink-200 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-shelf-700 rounded-full transition-base"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-ink-500 mt-1">
        {totalPages
          ? `${currentPage} of ${totalPages} pages`
          : `Page ${currentPage}`}
      </p>
    </div>
  );
}
