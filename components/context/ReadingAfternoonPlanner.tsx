"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ReadingKitData } from "@/components/context/ReadingKitBuilder";
import {
  estimateReadingPages,
  weatherPlaceSuggestion,
} from "@/lib/reading-afternoon";

type Work = { id: string; title: string; authorName: string };
type Kit = { id: string; title: string };
type Afternoon = {
  id: string;
  version: number;
  date: string | Date;
  durationMinutes: number;
  place: string;
  weather: string;
  pace: string;
  notes: string;
  status: string;
  kitId: string | null;
  work: Work | null;
};

function tomorrowLocalDateTime() {
  const date = new Date(Date.now() + 86400000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTime(value: string | Date) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ReadingAfternoonPlanner({
  works,
  kits,
  initial,
  initialNextPage,
}: {
  works: Work[];
  kits: Kit[];
  initial: Afternoon[];
  initialNextPage: number | null;
}) {
  const [items, setItems] = useState(initial);
  const [nextPage, setNextPage] = useState(initialNextPage);
  const [listQuery, setListQuery] = useState("");
  const [availableKits, setAvailableKits] = useState(kits);
  const [kitQuery, setKitQuery] = useState("");
  const [workOptions, setWorkOptions] = useState(works);
  const [workQuery, setWorkQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [date, setDate] = useState(tomorrowLocalDateTime);
  const [duration, setDuration] = useState(90);
  const [place, setPlace] = useState("home");
  const [weather, setWeather] = useState("indoors");
  const [pace, setPace] = useState("steady");
  const [workId, setWorkId] = useState(works[0]?.id ?? "");
  const [kitId, setKitId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [draftVersion, setDraftVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (
        event as CustomEvent<{ id: string; title?: string; deleted: boolean }>
      ).detail;
      setAvailableKits((current) =>
        detail.deleted
          ? current.filter((kit) => kit.id !== detail.id)
          : [
              { id: detail.id, title: detail.title || "Reading kit" },
              ...current.filter((kit) => kit.id !== detail.id),
            ],
      );
      if (detail.deleted)
        setKitId((current) => (current === detail.id ? "" : current));
    };
    window.addEventListener("folio-reading-kit-changed", update);
    return () =>
      window.removeEventListener("folio-reading-kit-changed", update);
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reading-afternoons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          afternoonId: requestId,
          version: draftVersion,
          afternoon: {
            date: new Date(date).toISOString(),
            durationMinutes: duration,
            place,
            weather,
            pace,
            workId: workId || null,
            kitId: kitId || null,
            notes,
            status: "planned",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Could not save the reading afternoon.");
      const work = workOptions.find((item) => item.id === workId) ?? null;
      const saved = {
        id: data.afternoonId,
        version: data.version,
        date,
        durationMinutes: duration,
        place,
        weather,
        pace,
        notes,
        status: "planned",
        kitId: kitId || null,
        work,
      };
      setItems((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? saved : item))
          : [saved, ...current],
      );
      setNotes("");
      setRequestId(crypto.randomUUID());
      setDraftVersion(0);
      setEditingId(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save the reading afternoon.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, version: number) {
    if (!window.confirm("Cancel this reading afternoon?")) return;
    const res = await fetch("/api/reading-afternoons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ afternoonId: id, version }),
    });
    if (!res.ok) {
      setError("Could not cancel the reading afternoon.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function edit(item: Afternoon) {
    if (item.work && !workOptions.some((work) => work.id === item.work!.id))
      setWorkOptions((current) => [item.work!, ...current]);
    setEditingId(item.id);
    setRequestId(item.id);
    setDraftVersion(item.version);
    setDate(localDateTime(item.date));
    setDuration(item.durationMinutes);
    setPlace(item.place);
    setWeather(item.weather);
    setPace(item.pace);
    setWorkId(item.work?.id || "");
    setKitId(item.kitId || "");
    setNotes(item.notes);
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

  async function searchKits() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/reading-kits?q=${encodeURIComponent(kitQuery)}&page=0`,
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not search reading kits.");
      setAvailableKits((current) => {
        const selectedKit = current.find((kit) => kit.id === kitId);
        const found = data.kits.map((kit: ReadingKitData) => ({
          id: kit.id,
          title: kit.title,
        }));
        return selectedKit &&
          !found.some((kit: Kit) => kit.id === selectedKit.id)
          ? [selectedKit, ...found]
          : found;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not search reading kits.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadAfternoons(reset: boolean) {
    setLoadingList(true);
    setError("");
    try {
      const page = reset ? 0 : nextPage;
      const response = await fetch(
        `/api/reading-afternoons?q=${encodeURIComponent(listQuery.trim())}&page=${page ?? 0}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not load reading afternoons.");
      setItems((current) =>
        reset
          ? data.afternoons
          : [
              ...new Map(
                [...current, ...data.afternoons].map((item: Afternoon) => [
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
          : "Could not load reading afternoons.",
      );
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded border border-ink-200 p-5">
        <h2 className="font-display text-2xl">
          {editingId ? "Edit reading afternoon" : "Plan a reading afternoon"}
        </h2>
        <p className="text-sm text-ink-500">
          Choose conditions yourself. This planner does not fetch live weather,
          reserve places or infer reading speed from providers.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Date and time
            <Input
              aria-label="Date and time"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Duration
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </label>
          <label className="text-sm">
            Place
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            >
              {["home", "garden", "cafe", "park", "library", "other"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-sm">
            Expected conditions
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
            >
              {["sunny", "cloudy", "rainy", "snowy", "indoors"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Reading pace
            <select
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={pace}
              onChange={(e) => setPace(e.target.value)}
            >
              {["slow", "steady", "focused", "immersive"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Book
            <div className="flex gap-2">
              <Input
                aria-label="Search books for afternoon"
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
          <label className="text-sm sm:col-span-2">
            Reading kit
            <div className="flex gap-2">
              <Input
                aria-label="Search kits for afternoon"
                placeholder="Kit title or linked book"
                value={kitQuery}
                onChange={(event) => setKitQuery(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void searchKits()}
              >
                Search kits
              </Button>
            </div>
            <select
              aria-label="Reading kit"
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
              value={kitId}
              onChange={(e) => setKitId(e.target.value)}
            >
              <option value="">No kit</option>
              {availableKits.map((kit) => (
                <option key={kit.id} value={kit.id}>
                  {kit.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Notes
          <textarea
            className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <aside className="rounded bg-ink-50 p-3 text-sm">
          <p>
            <strong>Local estimate:</strong> about{" "}
            {estimateReadingPages(duration, pace as never)} pages, based only on
            25 pages/hour.
          </p>
          <p className="mt-1">
            {weatherPlaceSuggestion(weather as never, place as never)}
          </p>
        </aside>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button disabled={saving} onClick={() => void save()}>
          {saving
            ? "Saving..."
            : editingId
              ? "Save afternoon changes"
              : "Save reading afternoon"}
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
              setNotes("");
            }}
          >
            Cancel afternoon editing
          </Button>
        )}
      </section>
      <section aria-label="Your reading afternoons" className="space-y-3">
        <h2 className="font-display text-2xl">Upcoming and planned</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void loadAfternoons(true);
          }}
        >
          <Input
            aria-label="Search reading afternoons"
            placeholder="Search place, conditions, notes or book"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={loadingList}>
            {loadingList ? "Searching..." : "Search afternoons"}
          </Button>
        </form>
        {items.map((item) => (
          <article key={item.id} className="rounded border border-ink-200 p-4">
            <div className="flex justify-between gap-4">
              <div>
                <h3 className="font-medium">
                  {item.work
                    ? `${item.work.title} — ${item.work.authorName}`
                    : "Open reading afternoon"}
                </h3>
                <p className="text-sm text-ink-500">
                  {new Date(item.date).toLocaleString()} ·{" "}
                  {item.durationMinutes} minutes · {item.place} · {item.weather}
                </p>
              </div>
              <button className="text-sm underline" onClick={() => edit(item)}>
                Edit
              </button>
              <button
                className="text-sm text-rose-700 underline"
                onClick={() => void remove(item.id, item.version)}
              >
                Cancel
              </button>
            </div>
            {item.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>
            )}
          </article>
        ))}
        {!items.length && (
          <p className="text-sm text-ink-500">
            No reading afternoons planned yet.
          </p>
        )}
        {nextPage !== null && (
          <Button
            variant="ghost"
            disabled={loadingList}
            onClick={() => void loadAfternoons(false)}
          >
            {loadingList ? "Loading..." : "Load more afternoons"}
          </Button>
        )}
      </section>
    </div>
  );
}
