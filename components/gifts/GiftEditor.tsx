"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { GIFT_PRIORITY, parsePounds } from "@/lib/gifts";
import { GiftSuggestions } from "./GiftSuggestions";
import type { GiftData } from "@/lib/gift-data";
type Book = { id: string; title: string; authorName: string };
export function GiftEditor({ initial }: { initial?: GiftData }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [taste, setTaste] = useState(initial?.tasteNotes ?? "");
  const [budget, setBudget] = useState(
    initial?.budgetPence == null ? "" : (initial.budgetPence / 100).toFixed(2),
  );
  const [occasions, setOccasions] = useState(initial?.occasions ?? []);
  const [items, setItems] = useState(
    (initial?.items ?? []).map((i) => ({
      ...i,
      price: i.pricePence == null ? "" : (i.pricePence / 100).toFixed(2),
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(initial?.id ?? "");
  const router = useRouter();
  const back = initial ? `/library/gifts/${initial.id}` : "/library/gifts";
  function change(action: () => void) {
    setDirty(true);
    action();
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    setSearchError("");
    setResults([]);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalogue/works?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search unavailable.");
        if (!controller.signal.aborted) setResults(data.works);
      } catch (e) {
        if (!controller.signal.aborted)
          setSearchError(
            e instanceof Error ? e.message : "Search unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);
  async function save(remove = false) {
    const budgetPence = parsePounds(budget);
    const prices = items.map((i) => parsePounds(i.price));
    if (
      !remove &&
      (budgetPence === undefined || prices.some((p) => p === undefined))
    ) {
      setError(
        "Enter amounts from 0 to 999999.99 with at most two decimal places.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setConflict(false);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const res = await fetch(
        initial ? `/api/gifts/${initial.id}` : "/api/gifts/contacts",
        {
          method: remove ? "DELETE" : initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: requestId.current,
            version: initial?.version,
            name,
            tasteNotes: taste,
            budgetPence,
            occasions,
            items: items.map((i, index) => ({
              workId: i.workId,
              status: i.status,
              priority: i.priority,
              pricePence: prices[index],
              note: i.note,
            })),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setConflict(res.status === 409);
        throw new Error(
          data.error || "That didn't save. Your draft is still here.",
        );
      }
      router.push(remove ? "/library/gifts" : `/library/gifts/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That didn't save. Your draft is still here.",
      );
      setConfirm(null);
      setBusy(false);
    }
  }
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <h1 className="font-display text-3xl">
        {initial ? "Edit gift planning" : "Add someone"}
      </h1>
      <p className="text-ink-500">
        Recipient details and gift ideas are private to you.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        <fieldset disabled={busy} className="space-y-6">
          <label className="block text-sm">
            Name
            <Input
              aria-label="Recipient name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => change(() => setName(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Reading preferences
            <Textarea
              aria-label="Reading preferences"
              rows={3}
              maxLength={5000}
              value={taste}
              onChange={(e) => change(() => setTaste(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Budget per gift (GBP)
            <Input
              aria-label="Budget per gift (GBP)"
              inputMode="decimal"
              placeholder="Optional, e.g. 25.00"
              value={budget}
              onChange={(e) => change(() => setBudget(e.target.value))}
            />
          </label>
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Occasions</h2>
            <p className="text-xs text-ink-500">
              Upcoming dates appear in Gift lists. Annual 29 February occasions
              use 28 February in other years.
            </p>
            {occasions.map((o, index) => (
              <div key={o.id} className="bg-paper-100 rounded-md p-4 space-y-3">
                <label className="block text-sm">
                  Occasion
                  <Input
                    aria-label={`Occasion ${index + 1} label`}
                    required
                    maxLength={100}
                    value={o.label}
                    onChange={(e) =>
                      change(() =>
                        setOccasions((list) =>
                          list.map((c) =>
                            c.id === o.id ? { ...c, label: e.target.value } : c,
                          ),
                        ),
                      )
                    }
                  />
                </label>
                <label className="block text-sm">
                  Date
                  <Input
                    type="date"
                    aria-label={`Occasion ${index + 1} date`}
                    required
                    min="1900-01-01"
                    max="2200-12-31"
                    value={o.date}
                    onChange={(e) =>
                      change(() =>
                        setOccasions((list) =>
                          list.map((c) =>
                            c.id === o.id
                              ? {
                                  ...c,
                                  date: e.target.value,
                                  dismissedFor: null,
                                }
                              : c,
                          ),
                        ),
                      )
                    }
                  />
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={o.annual}
                    onChange={(e) =>
                      change(() =>
                        setOccasions((list) =>
                          list.map((c) =>
                            c.id === o.id
                              ? {
                                  ...c,
                                  annual: e.target.checked,
                                  dismissedFor: null,
                                }
                              : c,
                          ),
                        ),
                      )
                    }
                  />
                  Repeat every year
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove occasion ${index + 1}`}
                  onClick={() =>
                    change(() =>
                      setOccasions((list) => list.filter((c) => c.id !== o.id)),
                    )
                  }
                >
                  Remove occasion
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={occasions.length >= 20}
              onClick={() =>
                change(() =>
                  setOccasions((list) => [
                    ...list,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      date: "",
                      annual: false,
                      dismissedFor: null,
                    },
                  ]),
                )
              }
            >
              Add occasion
            </Button>
          </section>
          <section className="space-y-4">
            <h2 className="font-display text-2xl">Book ideas</h2>
            {!items.length && (
              <p className="text-sm text-ink-500">
                Search the catalogue below to add your first idea.
              </p>
            )}
            {items.map((item) => (
              <article
                key={item.workId}
                className="bg-paper-100 rounded-md p-4 space-y-3"
              >
                <h3 className="font-display text-xl break-words">
                  {item.work.title}
                </h3>
                <p className="text-sm text-ink-500">{item.work.authorName}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    Status
                    <select
                      aria-label={`Status for ${item.work.title}`}
                      value={item.status}
                      onChange={(e) =>
                        change(() =>
                          setItems((list) =>
                            list.map((i) =>
                              i.workId === item.workId
                                ? {
                                    ...i,
                                    status: e.target
                                      .value as typeof item.status,
                                  }
                                : i,
                            ),
                          ),
                        )
                      }
                      className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
                    >
                      <option value="planned">Planned</option>
                      <option value="bought">Bought</option>
                      <option value="given">Given</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Fit
                    <select
                      aria-label={`Fit for ${item.work.title}`}
                      value={item.priority}
                      onChange={(e) =>
                        change(() =>
                          setItems((list) =>
                            list.map((i) =>
                              i.workId === item.workId
                                ? {
                                    ...i,
                                    priority: e.target
                                      .value as typeof item.priority,
                                  }
                                : i,
                            ),
                          ),
                        )
                      }
                      className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
                    >
                      {Object.entries(GIFT_PRIORITY).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  Your price estimate (GBP)
                  <Input
                    aria-label={`Price estimate for ${item.work.title}`}
                    inputMode="decimal"
                    value={item.price}
                    onChange={(e) =>
                      change(() =>
                        setItems((list) =>
                          list.map((i) =>
                            i.workId === item.workId
                              ? { ...i, price: e.target.value }
                              : i,
                          ),
                        ),
                      )
                    }
                  />
                </label>
                <label className="block text-sm">
                  Private gift note
                  <Textarea
                    aria-label={`Gift note for ${item.work.title}`}
                    rows={2}
                    maxLength={2000}
                    value={item.note}
                    onChange={(e) =>
                      change(() =>
                        setItems((list) =>
                          list.map((i) =>
                            i.workId === item.workId
                              ? { ...i, note: e.target.value }
                              : i,
                          ),
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${item.work.title}`}
                  onClick={() =>
                    change(() =>
                      setItems((list) =>
                        list.filter((i) => i.workId !== item.workId),
                      ),
                    )
                  }
                >
                  Remove book idea
                </Button>
              </article>
            ))}
          </section>
          {initial ? (
            <GiftSuggestions
              contactId={initial.id}
              version={initial.version}
              tasteNotes={taste}
              budget={budget}
              excluded={items.map((item) => item.workId)}
              onAdd={(suggestion) =>
                change(() =>
                  setItems((list) =>
                    list.some((item) => item.workId === suggestion.workId) ||
                    list.length >= 100
                      ? list
                      : [
                          ...list,
                          {
                            workId: suggestion.workId,
                            work: suggestion.work,
                            status: "planned",
                            priority: suggestion.priority,
                            price: "",
                            pricePence: null,
                            note: `AI suggestion: ${suggestion.reason}`,
                          },
                        ],
                  ),
                )
              }
            />
          ) : (
            <p className="text-sm">
              Save this person first to ask AI for additional gift ideas.
            </p>
          )}
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Add from the catalogue</h2>
            <Input
              aria-label="Search books for gifts"
              maxLength={300}
              value={query}
              placeholder="Title, author, or ISBN"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAttempt((n) => n + 1);
                }
              }}
            />
            <p className="text-xs text-ink-500">
              Book missing?{" "}
              <Link
                href="/browse"
                target="_blank"
                rel="noopener noreferrer"
                className="text-shelf-700 underline"
              >
                Find and add it in Browse
              </Link>
              , then search here again.
            </p>
            {searching && <p role="status">Searching catalogue...</p>}
            {searchError && (
              <p role="alert">
                {searchError}{" "}
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </button>
              </p>
            )}
            {!searching && !searchError && !results.length && (
              <p>No catalogue matches.</p>
            )}
            <ul className="space-y-2">
              {results.map((book) => (
                <li
                  key={book.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-ink-200"
                >
                  <span className="text-sm min-w-0 break-words">
                    {book.title}
                    <span className="block text-xs text-ink-500">
                      {book.authorName}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      items.length >= 100 ||
                      items.some((i) => i.workId === book.id)
                    }
                    aria-label={`Add ${book.title} as a gift`}
                    onClick={() =>
                      change(() =>
                        setItems((list) => [
                          ...list,
                          {
                            workId: book.id,
                            work: book,
                            status: "planned",
                            priority: "might_like",
                            price: "",
                            pricePence: null,
                            note: "",
                          },
                        ]),
                      )
                    }
                  >
                    {items.some((i) => i.workId === book.id) ? "Added" : "Add"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </fieldset>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        {conflict && initial && (
          <Link
            href={back}
            target="_blank"
            className="text-shelf-700 underline"
          >
            Open saved gift list in a new tab
          </Link>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy}>
            Save gift list
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => (dirty ? setConfirm("leave") : router.push(back))}
          >
            Cancel
          </Button>
          {initial && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirm("delete")}
            >
              Delete person
            </Button>
          )}
        </div>
      </form>
      {confirm && (
        <Modal
          open
          title={
            confirm === "delete"
              ? "Delete this person and gift list?"
              : "Discard unsaved changes?"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="mb-4">
            {confirm === "delete"
              ? "Their planning details, gift ideas, claims and shared link will be removed. Your library books will stay there."
              : "Your changes have not been saved."}
          </p>
          <div className="flex gap-3">
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                confirm === "delete" ? void save(true) : router.push(back)
              }
            >
              {confirm === "delete" ? "Confirm deletion" : "Discard changes"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep editing
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
