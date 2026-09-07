export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="font-display text-3xl text-ink-950 mb-2">{title}</h1>
      <p className="text-base text-ink-500">
        This part of Folio is on the way — later build phases cover it.
      </p>
    </div>
  );
}
