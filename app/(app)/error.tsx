"use client";
import { Button } from "@/components/ui/Button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto px-8 py-16">
      <h1 className="font-display text-3xl mb-4">
        Your books couldn&apos;t load
      </h1>
      <p className="text-ink-500 mb-6">
        The connection was interrupted. Try again in a moment.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
