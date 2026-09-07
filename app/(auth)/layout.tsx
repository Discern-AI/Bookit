export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-ink-950 text-center mb-8">Folio</h1>
        {children}
      </div>
    </div>
  );
}
