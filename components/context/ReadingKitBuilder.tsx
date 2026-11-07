"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { buildSensoryProfile } from "@/lib/reading-kit";

export type KitWork = { id: string; title: string; authorName: string };
export type ReadingKitData = {
  id: string;
  version: number;
  title: string;
  notes: string;
  makeDo: string;
  sensoryProfile: string;
  budgetTier: string;
  isPublic: boolean;
  entries: { workId: string; note: string; work: KitWork }[];
};

export function ReadingKitBuilder({
  works,
  initial,
  initialNextPage,
}: {
  works: KitWork[];
  initial: ReadingKitData[];
  initialNextPage: number | null;
}) {
  const [kits, setKits] = useState(initial);
  const [nextPage, setNextPage] = useState(initialNextPage);
  const [kitQuery, setKitQuery] = useState("");
  const [workOptions, setWorkOptions] = useState(works);
  const [workQuery, setWorkQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [makeDo, setMakeDo] = useState("");
  const [sensoryProfile, setSensoryProfile] = useState("");
  const [budgetTier, setBudgetTier] = useState("comfortable");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [draftVersion, setDraftVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reading-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: requestId,
          version: draftVersion,
          kit: {
            title,
            notes,
            makeDo,
            sensoryProfile,
            budgetTier,
            isPublic: false,
            entries: selected.map((workId) => ({ workId, note: "" })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Reading kit could not be saved.");
      const kitWork = new Map(workOptions.map((work) => [work.id, work]));
      const savedKit = {
        id: data.kitId,
        version: data.version,
        title,
        notes,
        makeDo,
        sensoryProfile,
        budgetTier,
        isPublic: false,
        entries: selected.map((workId) => ({
          workId,
          note: "",
          work: kitWork.get(workId)!,
        })),
      };
      setKits((items) =>
        editingId
          ? items.map((item) => (item.id === editingId ? savedKit : item))
          : [savedKit, ...items],
      );
      window.dispatchEvent(
        new CustomEvent("folio-reading-kit-changed", {
          detail: { id: data.kitId, title, deleted: false },
        }),
      );
      setTitle("");
      setNotes("");
      setMakeDo("");
      setSensoryProfile("");
      setSelected([]);
      setRequestId(crypto.randomUUID());
      setDraftVersion(0);
      setEditingId(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reading kit could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, version: number) {
    if (!window.confirm("Delete this private reading kit?")) return;
    setError("");
    const res = await fetch("/api/reading-kits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kitId: id, version }),
    });
    if (!res.ok) {
      setError("Reading kit could not be deleted.");
      return;
    }
    setKits((items) => items.filter((kit) => kit.id !== id));
    window.dispatchEvent(
      new CustomEvent("folio-reading-kit-changed", {
        detail: { id, deleted: true },
      }),
    );
  }

  function edit(kit: ReadingKitData) {
    setWorkOptions((current) => [
      ...new Map(
        [...kit.entries.map((entry) => entry.work), ...current].map((work) => [
          work.id,
          work,
        ]),
      ).values(),
    ]);
    setEditingId(kit.id);
    setRequestId(kit.id);
    setDraftVersion(kit.version);
    setTitle(kit.title);
    setNotes(kit.notes);
    setMakeDo(kit.makeDo);
    setSensoryProfile(kit.sensoryProfile);
    setBudgetTier(kit.budgetTier);
    setSelected(kit.entries.map((entry) => entry.workId));
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
        const chosen = current.filter((work) => selected.includes(work.id));
        return [
          ...new Map(
            [...chosen, ...data.works].map((work: KitWork) => [work.id, work]),
          ).values(),
        ];
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

  async function loadKits(reset: boolean) {
    setLoadingList(true);
    setError("");
    try {
      const page = reset ? 0 : nextPage;
      const response = await fetch(
        `/api/reading-kits?q=${encodeURIComponent(kitQuery.trim())}&page=${page ?? 0}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not load reading kits.");
      setKits((current) =>
        reset
          ? data.kits
          : [
              ...new Map(
                [...current, ...data.kits].map((kit: ReadingKitData) => [
                  kit.id,
                  kit,
                ]),
              ).values(),
            ],
      );
      setNextPage(data.nextPage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load reading kits.",
      );
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded border border-ink-200 p-5">
        <h2 className="font-display text-2xl">
          {editingId ? "Edit reading kit" : "Create a reading kit"}
        </h2>
        <p className="text-sm text-ink-500">
          A private plan for a reading ritual. It does not buy, publish or
          reserve anything.
        </p>
        <Input
          aria-label="Kit title"
          placeholder="A quiet Sunday reading kit"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <label className="block text-sm">
          Budget approach
          <select
            className="block w-full rounded border border-ink-200 bg-paper-50 p-2"
            value={budgetTier}
            onChange={(e) => setBudgetTier(e.target.value)}
          >
            <option value="make_do">Make do</option>
            <option value="comfortable">Comfortable</option>
            <option value="collector">Collector</option>
            <option value="dream">Dream library</option>
          </select>
        </label>
        <label className="block text-sm">
          Plan
          <textarea
            className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-24"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Books, objects, atmosphere, playlist or places to use..."
          />
        </label>
        <label className="block text-sm">
          Use what you already have
          <textarea
            className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
            value={makeDo}
            maxLength={1000}
            onChange={(e) => setMakeDo(e.target.value)}
            placeholder="Existing mug, lamp, blanket, bookmark or chair..."
          />
        </label>
        <section className="space-y-2 rounded border border-ink-100 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Sensory suggestions</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSensoryProfile(
                  buildSensoryProfile(
                    budgetTier,
                    makeDo.trim().length > 0,
                    selected.length > 0,
                  ),
                )
              }
            >
              Generate local suggestions
            </Button>
          </div>
          <p className="text-xs text-ink-500">
            Generated on this device. These are optional private ideas, not
            personalised medical or atmospheric advice.
          </p>
          <label className="block text-sm">
            Sensory plan
            <textarea
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
              value={sensoryProfile}
              maxLength={1000}
              onChange={(e) => setSensoryProfile(e.target.value)}
              placeholder="Lighting, sound, comfort and atmosphere..."
            />
          </label>
        </section>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Books in the kit</legend>
          <div className="flex gap-2">
            <Input
              aria-label="Search books for kit"
              placeholder="Title, author or ISBN"
              value={workQuery}
              onChange={(event) => setWorkQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchWorks();
                }
              }}
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
          {workOptions.map((work) => (
            <label key={work.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(work.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, work.id]
                      : ids.filter((id) => id !== work.id),
                  )
                }
              />
              <span>
                <span className="font-medium">{work.title}</span> —{" "}
                {work.authorName}
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button
          disabled={saving || title.trim().length < 3}
          onClick={() => void save()}
        >
          {saving
            ? "Saving..."
            : editingId
              ? "Save kit changes"
              : "Save private kit"}
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
              setTitle("");
              setNotes("");
              setMakeDo("");
              setSensoryProfile("");
              setSelected([]);
            }}
          >
            Cancel kit editing
          </Button>
        )}
      </section>
      <section aria-label="Saved kits" className="space-y-3">
        <h2 className="font-display text-2xl">Your kits</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void loadKits(true);
          }}
        >
          <Input
            aria-label="Search reading kits"
            placeholder="Search kits or linked books"
            value={kitQuery}
            onChange={(event) => setKitQuery(event.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={loadingList}>
            {loadingList ? "Searching..." : "Search kits"}
          </Button>
        </form>
        {kits.map((kit) => (
          <article
            key={kit.id}
            className="rounded border border-ink-200 p-4 space-y-2"
          >
            <div className="flex justify-between gap-4">
              <h3 className="font-medium break-words">{kit.title}</h3>
              <button className="text-sm underline" onClick={() => edit(kit)}>
                Edit
              </button>
              <button
                className="text-sm text-rose-700 underline"
                onClick={() => void remove(kit.id, kit.version)}
              >
                Delete
              </button>
            </div>
            <p className="text-xs uppercase text-ink-500">
              {kit.budgetTier.replace("_", " ")}
            </p>
            {kit.notes && (
              <p className="whitespace-pre-wrap text-sm">{kit.notes}</p>
            )}
            {kit.makeDo && (
              <p className="text-sm">
                <span className="font-medium">Use what you have:</span>{" "}
                {kit.makeDo}
              </p>
            )}
            {kit.sensoryProfile && (
              <p className="text-sm whitespace-pre-wrap">
                <span className="font-medium">Sensory plan:</span>{" "}
                {kit.sensoryProfile}
              </p>
            )}
            <ul className="text-sm list-disc pl-5">
              {kit.entries.map((entry) => (
                <li key={entry.workId}>
                  {entry.work.title} — {entry.work.authorName}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {!kits.length && (
          <p className="text-sm text-ink-500">No reading kits yet.</p>
        )}
        {nextPage !== null && (
          <Button
            variant="ghost"
            disabled={loadingList}
            onClick={() => void loadKits(false)}
          >
            {loadingList ? "Loading..." : "Load more kits"}
          </Button>
        )}
      </section>
    </div>
  );
}
