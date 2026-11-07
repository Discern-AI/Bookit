"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { nearbyBookshopUrl } from "@/lib/acquisition";
import { bookshopOutcomes } from "@/lib/bookshop-outcome";

type Work = { id: string; title: string; authorName: string };
type Outcome = {
  id: string;
  version: number;
  shopName: string;
  outcome: string;
  notes: string;
  externalUrl: string;
  work: Work | null;
};

export function BookshopOutcomeManager({
  works,
  initial,
  initialNextPage,
}: {
  works: Work[];
  initial: Outcome[];
  initialNextPage: number | null;
}) {
  const [items, setItems] = useState(initial);
  const [nextPage, setNextPage] = useState(initialNextPage);
  const [listQuery, setListQuery] = useState("");
  const [workOptions, setWorkOptions] = useState(works);
  const [workQuery, setWorkQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [workId, setWorkId] = useState(works[0]?.id ?? "");
  const [shopName, setShopName] = useState("");
  const [outcome, setOutcome] = useState("saved_search");
  const [notes, setNotes] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [draftVersion, setDraftVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  function findNearby() {
    setError("");
    const fallback =
      "https://www.google.com/maps/search/independent+bookshops+near+me";
    if (!("geolocation" in navigator)) {
      setMapUrl(fallback);
      window.open(fallback, "_blank", "noopener,noreferrer");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const url =
          nearbyBookshopUrl(
            position.coords.latitude,
            position.coords.longitude,
          ) ?? fallback;
        setMapUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      },
      () => {
        setMapUrl(fallback);
        window.open(fallback, "_blank", "noopener,noreferrer");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1800000 },
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/bookshop-outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeId: requestId,
          version: draftVersion,
          outcome: {
            workId: workId || null,
            shopName,
            outcome,
            notes,
            // Map coordinates remain in this browser tab and are not saved.
            externalUrl: "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save outcome.");
      const work = workOptions.find((item) => item.id === workId) ?? null;
      const saved = {
        id: data.outcomeId,
        version: data.version,
        shopName,
        outcome,
        notes,
        externalUrl: "",
        work,
      };
      setItems((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? saved : item))
          : [saved, ...current],
      );
      setShopName("");
      setNotes("");
      setRequestId(crypto.randomUUID());
      setDraftVersion(0);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save outcome.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string, version: number) {
    if (!window.confirm("Delete this private bookshop outcome?")) return;
    const res = await fetch("/api/bookshop-outcomes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomeId: id, version }),
    });
    if (!res.ok) {
      setError("Could not delete outcome.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function edit(item: Outcome) {
    if (item.work && !workOptions.some((work) => work.id === item.work!.id))
      setWorkOptions((current) => [item.work!, ...current]);
    setEditingId(item.id);
    setRequestId(item.id);
    setDraftVersion(item.version);
    setWorkId(item.work?.id || "");
    setShopName(item.shopName);
    setOutcome(item.outcome);
    setNotes(item.notes);
    setMapUrl("");
    setError("");
  }

  async function searchWorks() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/library/works?q=${encodeURIComponent(workQuery)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not search your library.");
      setWorkOptions((current) => {
        const selectedWork = current.find((work) => work.id === workId);
        return selectedWork &&
          !data.works.some((work: Work) => work.id === selectedWork.id)
          ? [selectedWork, ...data.works]
          : data.works;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not search your library.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadOutcomes(reset: boolean) {
    setLoadingList(true);
    setError("");
    try {
      const page = reset ? 0 : nextPage;
      const response = await fetch(
        `/api/bookshop-outcomes?q=${encodeURIComponent(listQuery.trim())}&page=${page ?? 0}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not load bookshop outcomes.");
      setItems((current) =>
        reset
          ? data.outcomes
          : [
              ...new Map(
                [...current, ...data.outcomes].map((item: Outcome) => [
                  item.id,
                  item,
                ]),
              ).values(),
            ],
      );
      setNextPage(data.nextPage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load bookshop outcomes.",
      );
    } finally {
      setLoadingList(false);
    }
  }

  const titles: Record<string, string> = {
    saved_search: "Saved search",
    planned_visit: "Planned visit",
    visited: "Visited",
    asked_about: "Asked about copy",
    found_copy: "Found copy",
    unavailable: "Not available",
    ordered_elsewhere: "Ordered elsewhere",
  };
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded border border-ink-200 p-5">
        <h2 className="font-display text-2xl">
          {editingId ? "Edit bookshop outcome" : "Nearby bookshops"}
        </h2>
        <p className="text-sm text-ink-500">
          Open an external map search, then privately record what happened.
          Location is requested only by this action and is not stored.
        </p>
        <Button type="button" onClick={findNearby}>
          Find bookshops near me
        </Button>
        {mapUrl && (
          <p className="text-sm">
            <a
              className="text-shelf-700 underline"
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open current search in Google Maps
            </a>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Book
            <div className="flex gap-2">
              <Input
                aria-label="Search books for bookshop outcome"
                placeholder="Title, author or ISBN"
                value={workQuery}
                onChange={(event) => setWorkQuery(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void searchWorks()}
              >
                Search books
              </Button>
            </div>
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={workId}
              onChange={(e) => setWorkId(e.target.value)}
            >
              <option value="">No specific book</option>
              {workOptions.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title} — {work.authorName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Shop name
            <Input
              aria-label="Shop name"
              value={shopName}
              maxLength={160}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Optional shop or area"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Outcome
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              {bookshopOutcomes.map((value) => (
                <option key={value} value={value}>
                  {titles[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Private notes
          <textarea
            className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Call, opening hours, copy condition or follow-up..."
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button disabled={saving} onClick={() => void save()}>
          {saving
            ? "Saving..."
            : editingId
              ? "Save outcome changes"
              : "Save private outcome"}
        </Button>
        {editingId && (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setEditingId(null);
              setRequestId(crypto.randomUUID());
              setDraftVersion(0);
              setShopName("");
              setNotes("");
            }}
          >
            Cancel outcome editing
          </Button>
        )}
      </section>
      <section aria-label="Saved bookshop outcomes" className="space-y-3">
        <h2 className="font-display text-2xl">Saved outcomes</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void loadOutcomes(true);
          }}
        >
          <Input
            aria-label="Search bookshop outcomes"
            placeholder="Search shop, notes, outcome or book"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={loadingList}>
            {loadingList ? "Searching..." : "Search outcomes"}
          </Button>
        </form>
        {items.map((item) => (
          <article key={item.id} className="rounded border border-ink-200 p-4">
            <div className="flex justify-between gap-4">
              <div>
                <h3 className="font-medium">
                  {titles[item.outcome] ?? item.outcome}
                </h3>
                {item.shopName && <p className="text-sm">{item.shopName}</p>}
                {item.work && (
                  <p className="text-sm text-ink-500">
                    {item.work.title} — {item.work.authorName}
                  </p>
                )}
              </div>
              <button className="text-sm underline" onClick={() => edit(item)}>
                Edit
              </button>
              <button
                className="text-sm text-rose-700 underline"
                onClick={() => void remove(item.id, item.version)}
              >
                Delete
              </button>
            </div>
            {item.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>
            )}
            {item.externalUrl && (
              <a
                className="mt-2 block text-sm text-shelf-700 underline"
                href={item.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open map search
              </a>
            )}
          </article>
        ))}
        {!items.length && (
          <p className="text-sm text-ink-500">
            No bookshop outcomes saved yet.
          </p>
        )}
        {nextPage !== null && (
          <Button
            variant="ghost"
            disabled={loadingList}
            onClick={() => void loadOutcomes(false)}
          >
            {loadingList ? "Loading..." : "Load more outcomes"}
          </Button>
        )}
      </section>
    </div>
  );
}
