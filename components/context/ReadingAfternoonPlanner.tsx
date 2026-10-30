"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { estimateReadingPages, weatherPlaceSuggestion } from "@/lib/reading-afternoon";

type Work = { id: string; title: string; authorName: string };
type Kit = { id: string; title: string };
type Afternoon = { id: string; date: string | Date; durationMinutes: number; place: string; weather: string; pace: string; notes: string; status: string; work: Work | null };

export function ReadingAfternoonPlanner({ works, kits, initial }: { works: Work[]; kits: Kit[]; initial: Afternoon[] }) {
  const [items, setItems] = useState(initial);
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [duration, setDuration] = useState(90);
  const [place, setPlace] = useState("home");
  const [weather, setWeather] = useState("indoors");
  const [pace, setPace] = useState("steady");
  const [workId, setWorkId] = useState(works[0]?.id ?? "");
  const [kitId, setKitId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/reading-afternoons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ afternoon: { date: new Date(date).toISOString(), durationMinutes: duration, place, weather, pace, workId: workId || null, kitId: kitId || null, notes, status: "planned" } }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not save the reading afternoon.");
      const work = works.find((item) => item.id === workId) ?? null;
      setItems((current) => [{ id: data.afternoonId, date, durationMinutes: duration, place, weather, pace, notes, status: "planned", work }, ...current]); setNotes("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the reading afternoon."); } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Cancel this reading afternoon?")) return;
    const res = await fetch(`/api/reading-afternoons?afternoonId=${encodeURIComponent(id)}`, { method: "DELETE" }); if (!res.ok) { setError("Could not cancel the reading afternoon."); return; }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return <div className="space-y-6"><section className="space-y-4 rounded border border-ink-200 p-5"><h2 className="font-display text-2xl">Plan a reading afternoon</h2><p className="text-sm text-ink-500">Choose conditions yourself. This planner does not fetch live weather, reserve places or infer reading speed from providers.</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Date and time<Input aria-label="Date and time" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></label><label className="text-sm">Duration<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option></select></label><label className="text-sm">Place<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={place} onChange={(e) => setPlace(e.target.value)}>{["home","garden","cafe","park","library","other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Expected conditions<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={weather} onChange={(e) => setWeather(e.target.value)}>{["sunny","cloudy","rainy","snowy","indoors"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Reading pace<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={pace} onChange={(e) => setPace(e.target.value)}>{["slow","steady","focused","immersive"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Book<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={workId} onChange={(e) => setWorkId(e.target.value)}><option value="">No specific book</option>{works.map((work) => <option key={work.id} value={work.id}>{work.title} — {work.authorName}</option>)}</select></label><label className="text-sm sm:col-span-2">Reading kit<select className="block w-full rounded border border-ink-200 bg-paper-50 p-2" value={kitId} onChange={(e) => setKitId(e.target.value)}><option value="">No kit</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.title}</option>)}</select></label></div><label className="block text-sm">Notes<textarea className="block w-full rounded border border-ink-200 bg-paper-50 p-2 min-h-20" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label><aside className="rounded bg-ink-50 p-3 text-sm"><p><strong>Local estimate:</strong> about {estimateReadingPages(duration, pace as never)} pages, based only on 25 pages/hour.</p><p className="mt-1">{weatherPlaceSuggestion(weather as never, place as never)}</p></aside>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save reading afternoon"}</Button></section><section className="space-y-3"><h2 className="font-display text-2xl">Upcoming and planned</h2>{items.map((item) => <article key={item.id} className="rounded border border-ink-200 p-4"><div className="flex justify-between gap-4"><div><h3 className="font-medium">{item.work ? `${item.work.title} — ${item.work.authorName}` : "Open reading afternoon"}</h3><p className="text-sm text-ink-500">{new Date(item.date).toLocaleString()} · {item.durationMinutes} minutes · {item.place} · {item.weather}</p></div><button className="text-sm text-rose-700 underline" onClick={() => void remove(item.id)}>Cancel</button></div>{item.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>}</article>)}{!items.length && <p className="text-sm text-ink-500">No reading afternoons planned yet.</p>}</section></div>;
}