"use client";

import { useState } from "react";

export function ModeratePublicVideoReport({ reportId, version, restore = false }: { reportId: string; version: number; restore?: boolean }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(action: "dismiss" | "hide" | "restore") {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/moderation/video-projects/${reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version, note }) });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Decision saved. Reload this page." : data.error || "Could not save the decision.");
    setBusy(false);
  }
  return <div className="space-y-3"><label className="block text-sm">Decision note<textarea className="mt-1 block w-full rounded border border-ink-300 px-3 py-2" rows={3} minLength={5} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="flex flex-wrap gap-2">{restore ? <button type="button" className="rounded border border-ink-300 px-3 py-2 text-sm" disabled={busy || note.trim().length < 5} onClick={() => decide("restore")}>Restore video</button> : <><button type="button" className="rounded border border-ink-300 px-3 py-2 text-sm" disabled={busy || note.trim().length < 5} onClick={() => decide("dismiss")}>Dismiss</button><button type="button" className="rounded border border-red-300 px-3 py-2 text-sm" disabled={busy || note.trim().length < 5} onClick={() => decide("hide")}>Hide video</button></>}</div>{message && <p role="status" className="text-sm">{message}</p>}</div>;
}

export function ReportPublicVideo({ videoId }: { videoId: string }) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/video-projects/${videoId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Report submitted." : data.error || "Could not submit the report.");
    setBusy(false);
  }
  return <section className="rounded border border-ink-200 p-4 space-y-3"><h2 className="font-display text-lg">Report this video</h2><label className="block text-sm">Reason<select className="mt-1 block w-full rounded border border-ink-300 px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="misleading">Misleading</option><option value="copyright">Copyright</option><option value="other">Other</option></select></label><label className="block text-sm">Details<textarea className="mt-1 block w-full rounded border border-ink-300 px-3 py-2" rows={3} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} /></label><button type="button" className="rounded border border-ink-300 px-3 py-2 text-sm" disabled={busy} onClick={submit}>{busy ? "Submitting..." : "Submit report"}</button>{message && <p role="status" className="text-sm">{message}</p>}</section>;
}
