"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { buildSensoryProfile } from "@/lib/reading-kit";

export type KitWork = { id: string; title: string; authorName: string };
type KitItem = {
  kind: "reading_object" | "atmosphere" | "food_drink" | "resource";
  title: string;
  details: string;
  externalUrl: string;
};
export type ReadingKitData = {
  id: string;
  version: number;
  title: string;
  notes: string;
  makeDo: string;
  sensoryProfile: string;
  creatorEssay: string;
  playlistUrl: string;
  suggestedOrder: string;
  publicDescription: string;
  budgetTier: string;
  isPublic: boolean;
  entries: { workId: string; note: string; work: KitWork }[];
  items: KitItem[];
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
  const [creatorEssay, setCreatorEssay] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [suggestedOrder, setSuggestedOrder] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [items, setItems] = useState<KitItem[]>([]);
  const [itemKind, setItemKind] = useState<KitItem["kind"]>("reading_object");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDetails, setItemDetails] = useState("");
  const [itemUrl, setItemUrl] = useState("");
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
            creatorEssay,
            playlistUrl,
            suggestedOrder,
            publicDescription,
            budgetTier,
            isPublic,
            entries: selected.map((workId) => ({ workId, note: "" })),
            items,
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
        creatorEssay,
        playlistUrl,
        suggestedOrder,
        publicDescription,
        budgetTier,
        isPublic,
        entries: selected.map((workId) => ({
          workId,
          note: "",
          work: kitWork.get(workId)!,
        })),
        items,
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
      setCreatorEssay("");
      setPlaylistUrl("");
      setSuggestedOrder("");
      setPublicDescription("");
      setIsPublic(false);
      setItems([]);
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
    setCreatorEssay(kit.creatorEssay);
    setPlaylistUrl(kit.playlistUrl);
    setSuggestedOrder(kit.suggestedOrder);
    setPublicDescription(kit.publicDescription);
    setIsPublic(kit.isPublic);
    setItems(kit.items);
    setBudgetTier(kit.budgetTier);
    setSelected(kit.entries.map((entry) => entry.workId));
    setError("");
  }

  function addItem() {
    if (itemTitle.trim().length < 2 || items.length >= 20) return;
    setItems((current) => [
      ...current,
      {
        kind: itemKind,
        title: itemTitle.trim(),
        details: itemDetails.trim(),
        externalUrl: itemUrl.trim(),
      },
    ]);
    setItemTitle("");
    setItemDetails("");
    setItemUrl("");
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
        <section className="space-y-3 rounded border border-ink-100 p-3">
          <div>
            <h3 className="font-medium">Creator package</h3>
            <p className="text-xs text-ink-500">
              Private structured material for now. Saving does not publish, sell
              or open external links.
            </p>
          </div>
          <label className="block text-sm">
            Short essay or introduction
            <textarea
              aria-label="Kit essay"
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-28"
              maxLength={6000}
              value={creatorEssay}
              onChange={(event) => setCreatorEssay(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Playlist link
            <Input
              aria-label="Playlist link"
              type="url"
              maxLength={2000}
              placeholder="Optional public http or https link"
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Suggested reading order
            <textarea
              aria-label="Suggested reading order"
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
              maxLength={2000}
              value={suggestedOrder}
              onChange={(event) => setSuggestedOrder(event.target.value)}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Objects and resources
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Type
                <select
                  className="block w-full rounded border p-2"
                  value={itemKind}
                  onChange={(event) =>
                    setItemKind(event.target.value as KitItem["kind"])
                  }
                >
                  <option value="reading_object">Reading object</option>
                  <option value="atmosphere">Atmosphere</option>
                  <option value="food_drink">Food or drink</option>
                  <option value="resource">Essay or resource</option>
                </select>
              </label>
              <Input
                aria-label="Package item title"
                maxLength={120}
                placeholder="Item title"
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
              />
              <Input
                aria-label="Package item details"
                maxLength={500}
                placeholder="Optional details"
                value={itemDetails}
                onChange={(event) => setItemDetails(event.target.value)}
              />
              <Input
                aria-label="Package item link"
                type="url"
                maxLength={2000}
                placeholder="Optional public link"
                value={itemUrl}
                onChange={(event) => setItemUrl(event.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={itemTitle.trim().length < 2 || items.length >= 20}
              onClick={addItem}
            >
              Add package item
            </Button>
            <ol className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={`${item.kind}-${index}`}
                  className="flex justify-between gap-3 rounded bg-ink-50 p-2 text-sm"
                >
                  <span>
                    <strong>{item.title}</strong> ·{" "}
                    {item.kind.replace("_", " ")}
                    {item.details ? ` — ${item.details}` : ""}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </fieldset>
        </section>
        <section className="space-y-3 rounded border border-ink-100 p-3">
          <div>
            <h3 className="font-medium">Community publication</h3>
            <p className="text-xs text-ink-500">
              Explicit publication shows the title, public description, essay,
              make-do and sensory guidance, playlist, suggested order,
              structured items and selected books. Private Plan notes are never
              shown.
            </p>
          </div>
          <label className="block text-sm">
            Public description
            <textarea
              aria-label="Public kit description"
              className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20"
              maxLength={1000}
              value={publicDescription}
              onChange={(event) => setPublicDescription(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />{" "}
            Publish this kit to the community
          </label>
          {isPublic && (
            <p className="text-xs text-ink-500">
              Publishing does not sell the kit, verify products or expose
              private Plan notes.
            </p>
          )}
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
              setCreatorEssay("");
              setPlaylistUrl("");
              setSuggestedOrder("");
              setPublicDescription("");
              setIsPublic(false);
              setItems([]);
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
              {kit.isPublic ? " · published" : " · private"}
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
            {kit.creatorEssay && (
              <p className="text-sm whitespace-pre-wrap">
                <span className="font-medium">Creator essay:</span>{" "}
                {kit.creatorEssay}
              </p>
            )}
            {kit.playlistUrl && (
              <p className="text-sm">
                <a
                  className="underline"
                  href={kit.playlistUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open playlist link
                </a>
              </p>
            )}
            {kit.suggestedOrder && (
              <p className="text-sm whitespace-pre-wrap">
                <span className="font-medium">Suggested order:</span>{" "}
                {kit.suggestedOrder}
              </p>
            )}
            {!!kit.items.length && (
              <ol className="text-sm list-decimal pl-5">
                {kit.items.map((item, index) => (
                  <li key={`${item.kind}-${index}`}>
                    {item.title} · {item.kind.replace("_", " ")}
                    {item.externalUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline"
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open link
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ol>
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
