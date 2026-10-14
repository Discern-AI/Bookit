"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { parsePounds, GIFT_PRIORITY } from "@/lib/gifts";
import type { GiftSuggestion } from "@/lib/gift-ai";
export function GiftSuggestions({
  contactId,
  version,
  tasteNotes,
  budget,
  excluded,
  onAdd,
}: {
  contactId: string;
  version: number;
  tasteNotes: string;
  budget: string;
  excluded: string[];
  onAdd: (suggestion: GiftSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<GiftSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setSuggestions([]);
    setComplete(false);
    setError("");
    return () => {
      controller.current?.abort();
    };
  }, [tasteNotes, budget, contactId, version]);
  async function generate() {
    const budgetPence = parsePounds(budget);
    if (!tasteNotes.trim() || budgetPence === undefined) {
      setError("Add reading preferences and check the budget first.");
      return;
    }
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setComplete(false);
    setSuggestions([]);
    try {
      const response = await fetch(`/api/gifts/${contactId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          tasteNotes,
          budgetPence,
          excludeWorkIds: excluded,
        }),
        signal: c.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not prepare suggestions.");
      if (!c.signal.aborted) {
        setSuggestions(data.suggestions);
        setComplete(true);
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not prepare suggestions. Try again.",
        );
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      id="gift-suggestions"
      aria-label="AI gift suggestions"
      className="border border-ink-200 rounded p-4 space-y-3"
    >
      <h2 className="font-display text-2xl">Expand your gift ideas</h2>
      <p className="text-sm">
        Asking AI sends the reading preferences and budget shown above, plus up
        to 40 catalogue candidates, to Claude. Recipient names, occasions,
        private book notes and chat history are excluded.
      </p>
      <p className="text-sm">
        Review each suggestion before adding it to this draft. Save the gift
        list to keep it. Saving also updates any active shared list;
        explanations remain private gift notes. Prices and availability need
        checking.
      </p>
      <Button
        type="button"
        disabled={busy || excluded.length >= 100}
        onClick={() => void generate()}
      >
        Ask AI to expand this list
      </Button>
      {busy && (
        <>
          <p role="status">Preparing gift suggestions...</p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            Cancel suggestions
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {complete && !suggestions.length && (
        <p>
          No suitable suggestions were returned. Try more specific preferences
          or add books from the catalogue.
        </p>
      )}
      {suggestions.map((suggestion) => (
        <article
          key={suggestion.workId}
          className="bg-paper-100 p-3 rounded space-y-2"
        >
          <h3 className="font-display text-xl break-words">
            <Link
              className="underline"
              href={`/book/${suggestion.workId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {suggestion.work.title}
            </Link>
          </h3>
          <p className="text-sm">
            {suggestion.work.authorName} / {GIFT_PRIORITY[suggestion.priority]}
          </p>
          <p className="whitespace-pre-wrap break-words">{suggestion.reason}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={
              excluded.includes(suggestion.workId) || excluded.length >= 100
            }
            onClick={() => onAdd(suggestion)}
            aria-label={`Add suggestion ${suggestion.work.title}`}
          >
            {excluded.includes(suggestion.workId)
              ? "Added to draft"
              : "Add to draft"}
          </Button>
        </article>
      ))}
      {!!suggestions.length && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSuggestions([]);
            setComplete(false);
          }}
        >
          Dismiss suggestions
        </Button>
      )}
    </section>
  );
}
