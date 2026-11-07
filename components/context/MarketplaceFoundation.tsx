"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Work = { id: string; title: string; authorName: string };
export type MarketplaceItem = {
  id: string;
  version: number;
  kind: "book" | "reading_object";
  category: "books_collecting" | "reading_objects";
  title: string;
  description: string;
  makeDoAlternative: string;
  budgetTier: "make_do" | "comfortable" | "collector" | "dream";
  pricePence: number | null;
  externalUrl: string;
  workId: string | null;
  work: Work | null;
  isPublished: boolean;
  isSaved: boolean;
  isOwner: boolean;
};

type MarketplaceForm = {
  title: string;
  description: string;
  makeDoAlternative: string;
  budgetTier: MarketplaceItem["budgetTier"];
  externalUrl: string;
  price: string;
  workId: string;
  kind: MarketplaceItem["kind"];
  isPublished: boolean;
};

const empty: MarketplaceForm = {
  title: "",
  description: "",
  makeDoAlternative: "",
  budgetTier: "comfortable",
  externalUrl: "",
  price: "",
  workId: "",
  kind: "reading_object",
  isPublished: false,
};

export function MarketplaceFoundation({
  works,
  initial,
}: {
  works: Work[];
  initial: MarketplaceItem[];
}) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(empty);
  const [listingId, setListingId] = useState(() => crypto.randomUUID());
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tier, setTier] = useState("all");

  const reset = () => {
    setForm(empty);
    setListingId(crypto.randomUUID());
    setVersion(0);
    setEditing(null);
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      const pricePence = form.price
        ? Math.round(Number(form.price) * 100)
        : null;
      const listing: Omit<
        MarketplaceItem,
        "id" | "version" | "work" | "isSaved" | "isOwner"
      > = {
        kind: form.kind,
        category: form.kind === "book" ? "books_collecting" : "reading_objects",
        title: form.title,
        description: form.description,
        makeDoAlternative: form.makeDoAlternative,
        budgetTier: form.budgetTier,
        pricePence,
        externalUrl: form.externalUrl,
        workId: form.kind === "book" ? form.workId || null : null,
        isPublished: form.isPublished,
      };
      const response = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, version, listing }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not save listing.");
      const work = works.find((item) => item.id === listing.workId) ?? null;
      const item: MarketplaceItem = {
        id: listingId,
        version: data.version,
        ...listing,
        work,
        isSaved: items.find((old) => old.id === listingId)?.isSaved ?? false,
        isOwner: true,
      };
      setItems((old) =>
        editing
          ? old.map((entry) => (entry.id === editing ? item : entry))
          : [item, ...old],
      );
      reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save listing.",
      );
    } finally {
      setBusy(false);
    }
  }

  function edit(item: MarketplaceItem) {
    setEditing(item.id);
    setListingId(item.id);
    setVersion(item.version);
    setForm({
      title: item.title,
      description: item.description,
      makeDoAlternative: item.makeDoAlternative,
      budgetTier: item.budgetTier,
      externalUrl: item.externalUrl,
      price: item.pricePence === null ? "" : (item.pricePence / 100).toFixed(2),
      workId: item.workId ?? "",
      kind: item.kind,
      isPublished: item.isPublished,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function action(
    item: MarketplaceItem,
    action: "save" | "unsave" | "delete",
  ) {
    if (
      action === "delete" &&
      !window.confirm("Delete this marketplace listing?")
    )
      return;
    setError("");
    const response = await fetch("/api/marketplace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        listingId: item.id,
        version: item.version,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      return setError(data.error || "Marketplace action failed.");
    if (action === "delete")
      setItems((old) => old.filter((entry) => entry.id !== item.id));
    else
      setItems((old) =>
        old.map((entry) =>
          entry.id === item.id
            ? { ...entry, isSaved: action === "save" }
            : entry,
        ),
      );
  }

  const visible = items.filter(
    (item) =>
      (item.isPublished || item.isOwner) &&
      (tier === "all" || item.budgetTier === tier),
  );
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-paper-300 bg-white p-5 space-y-4">
        <div>
          <h2 className="font-display text-2xl">
            {editing ? "Edit listing" : "Share a marketplace idea"}
          </h2>
          <p className="text-sm text-ink-500">
            Every listing offers a purchase path and a practical
            use-what-you-have alternative. Publishing is explicit.
          </p>
        </div>
        <div className="flex gap-4 flex-wrap">
          <label>
            <input
              type="radio"
              checked={form.kind === "reading_object"}
              onChange={() =>
                setForm({ ...form, kind: "reading_object", workId: "" })
              }
            />{" "}
            Reading object
          </label>
          <label>
            <input
              type="radio"
              checked={form.kind === "book"}
              onChange={() => setForm({ ...form, kind: "book" })}
            />{" "}
            Book or edition idea
          </label>
        </div>
        <Input
          aria-label="Listing title"
          placeholder="Listing title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        {form.kind === "book" && (
          <label className="block text-sm">
            Library book
            <select
              aria-label="Library book"
              className="mt-1 w-full rounded border p-2"
              value={form.workId}
              onChange={(event) =>
                setForm({ ...form, workId: event.target.value })
              }
            >
              <option value="">Choose a book</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title} — {work.authorName}
                </option>
              ))}
            </select>
          </label>
        )}
        <textarea
          aria-label="Description"
          className="w-full rounded border p-2"
          rows={3}
          placeholder="Why this belongs in a reading life"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
        <textarea
          aria-label="Use what you have alternative"
          className="w-full rounded border p-2"
          rows={2}
          placeholder="Use what you have instead…"
          value={form.makeDoAlternative}
          onChange={(event) =>
            setForm({ ...form, makeDoAlternative: event.target.value })
          }
        />
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">
            Budget tier
            <select
              className="mt-1 w-full rounded border p-2"
              value={form.budgetTier}
              onChange={(event) =>
                setForm({
                  ...form,
                  budgetTier: event.target.value as typeof form.budgetTier,
                })
              }
            >
              <option value="make_do">Make do</option>
              <option value="comfortable">Comfortable</option>
              <option value="collector">Collector</option>
              <option value="dream">Dream library</option>
            </select>
          </label>
          <Input
            aria-label="Indicative price in pounds"
            type="number"
            min="0"
            step="0.01"
            placeholder="Indicative £"
            value={form.price}
            onChange={(event) =>
              setForm({ ...form, price: event.target.value })
            }
          />
          <Input
            aria-label="External purchase link"
            type="url"
            placeholder="Optional external link"
            value={form.externalUrl}
            onChange={(event) =>
              setForm({ ...form, externalUrl: event.target.value })
            }
          />
        </div>
        <label className="block">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(event) =>
              setForm({ ...form, isPublished: event.target.checked })
            }
          />{" "}
          Publish to the community catalogue
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button disabled={busy} onClick={save}>
            {busy ? "Saving…" : editing ? "Save changes" : "Save listing"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Reading Life marketplace</h2>
            <p className="text-sm text-ink-500">
              Ideas only. Prices, stock and availability are not verified;
              purchases happen on external sites.
            </p>
          </div>
          <label className="text-sm">
            Budget{" "}
            <select
              className="rounded border p-2"
              value={tier}
              onChange={(event) => setTier(event.target.value)}
            >
              <option value="all">All tiers</option>
              <option value="make_do">Make do</option>
              <option value="comfortable">Comfortable</option>
              <option value="collector">Collector</option>
              <option value="dream">Dream library</option>
            </select>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-paper-300 bg-white p-5 space-y-3"
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-500">
                    {item.kind === "book"
                      ? "Books & collecting"
                      : "Reading object"}{" "}
                    · {item.budgetTier.replace("_", " ")}
                  </p>
                  <h3 className="font-display text-xl">{item.title}</h3>
                </div>
                {!item.isPublished && (
                  <span className="text-xs">Private draft</span>
                )}
              </div>
              {item.work && (
                <Link
                  className="text-sm underline"
                  href={`/book/${item.work.id}`}
                >
                  {item.work.title} — {item.work.authorName}
                </Link>
              )}
              <p>{item.description}</p>
              <div className="rounded bg-paper-100 p-3 text-sm">
                <strong>Use what you have:</strong> {item.makeDoAlternative}
              </div>
              {item.pricePence !== null && (
                <p className="text-sm">
                  Indicative price: £{(item.pricePence / 100).toFixed(2)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {item.externalUrl && (
                  <a
                    className="underline"
                    href={item.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open external listing
                  </a>
                )}
                {!item.isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      action(item, item.isSaved ? "unsave" : "save")
                    }
                  >
                    {item.isSaved ? "Remove saved idea" : "Save idea"}
                  </Button>
                )}
                {item.isOwner && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => edit(item)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => action(item, "delete")}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <p className="text-ink-500">
            No marketplace ideas match this budget yet.
          </p>
        )}
      </section>
    </div>
  );
}
