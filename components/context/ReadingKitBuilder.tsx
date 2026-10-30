"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { buildSensoryProfile } from "@/lib/reading-kit";

export type KitWork = { id: string; title: string; authorName: string };
export type ReadingKitData = { id: string; title: string; notes: string; makeDo: string; sensoryProfile: string; budgetTier: string; isPublic: boolean; entries: { workId: string; note: string; work: KitWork }[] };

export function ReadingKitBuilder({ works, initial }: { works: KitWork[]; initial: ReadingKitData[] }) {
  const [kits, setKits] = useState(initial);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [makeDo, setMakeDo] = useState("");
  const [sensoryProfile, setSensoryProfile] = useState("");
  const [budgetTier, setBudgetTier] = useState("comfortable");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/reading-kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kit: { title, notes, makeDo, sensoryProfile, budgetTier, isPublic: false, entries: selected.map((workId) => ({ workId, note: "" })) } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reading kit could not be saved.");
      const kitWork = new Map(works.map((work) => [work.id, work]));
      setKits((items) => [{ id: data.kitId, title, notes, makeDo, sensoryProfile, budgetTier, isPublic: false, entries: selected.map((workId) => ({ workId, note: "", work: kitWork.get(workId)! })) }, ...items]);
      setTitle(""); setNotes(""); setMakeDo(""); setSensoryProfile(""); setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Reading kit could not be saved."); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this private reading kit?")) return;
    setError("");
    const res = await fetch(`/api/reading-kits?kitId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { setError("Reading kit could not be deleted."); return; }
    setKits((items) => items.filter((kit) => kit.id !== id));
  }

  return <div className="space-y-8">
    <section className="space-y-4 rounded border border-ink-200 p-5">
      <h2 className="font-display text-2xl">Create a reading kit</h2>
      <p className="text-sm text-ink-500">A private plan for a reading ritual. It does not buy, publish or reserve anything.</p>
      <Input aria-label="Kit title" placeholder="A quiet Sunday reading kit" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <label className="block text-sm">Budget approach<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={budgetTier} onChange={(e) => setBudgetTier(e.target.value)}><option value="make_do">Make do</option><option value="comfortable">Comfortable</option><option value="collector">Collector</option><option value="dream">Dream library</option></select></label>
      <label className="block text-sm">Plan<textarea className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-24" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="Books, objects, atmosphere, playlist or places to use..." /></label>
      <label className="block text-sm">Use what you already have<textarea className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20" value={makeDo} maxLength={1000} onChange={(e) => setMakeDo(e.target.value)} placeholder="Existing mug, lamp, blanket, bookmark or chair..." /></label>
      <section className="space-y-2 rounded border border-ink-100 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Sensory suggestions</h3><Button type="button" variant="ghost" size="sm" onClick={() => setSensoryProfile(buildSensoryProfile(budgetTier, makeDo.trim().length > 0, selected.length > 0))}>Generate local suggestions</Button></div><p className="text-xs text-ink-500">Generated on this device. These are optional private ideas, not personalised medical or atmospheric advice.</p><label className="block text-sm">Sensory plan<textarea className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20" value={sensoryProfile} maxLength={1000} onChange={(e) => setSensoryProfile(e.target.value)} placeholder="Lighting, sound, comfort and atmosphere..." /></label></section>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Books in the kit</legend>{works.map((work) => <label key={work.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(work.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, work.id] : ids.filter((id) => id !== work.id))} /><span><span className="font-medium">{work.title}</span> — {work.authorName}</span></label>)}</fieldset>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <Button disabled={saving || title.trim().length < 3} onClick={() => void save()}>{saving ? "Saving..." : "Save private kit"}</Button>
    </section>
    <section className="space-y-3"><h2 className="font-display text-2xl">Your kits</h2>{kits.map((kit) => <article key={kit.id} className="rounded border border-ink-200 p-4 space-y-2"><div className="flex justify-between gap-4"><h3 className="font-medium break-words">{kit.title}</h3><button className="text-sm text-rose-700 underline" onClick={() => void remove(kit.id)}>Delete</button></div><p className="text-xs uppercase text-ink-500">{kit.budgetTier.replace("_", " ")}</p>{kit.notes && <p className="whitespace-pre-wrap text-sm">{kit.notes}</p>}{kit.makeDo && <p className="text-sm"><span className="font-medium">Use what you have:</span> {kit.makeDo}</p>}{kit.sensoryProfile && <p className="text-sm whitespace-pre-wrap"><span className="font-medium">Sensory plan:</span> {kit.sensoryProfile}</p>}<ul className="text-sm list-disc pl-5">{kit.entries.map((entry) => <li key={entry.workId}>{entry.work.title} — {entry.work.authorName}</li>)}</ul></article>)}{!kits.length && <p className="text-sm text-ink-500">No reading kits yet.</p>}</section>
  </div>;
}
