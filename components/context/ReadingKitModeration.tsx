"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ReportReadingKit({ kitId }: { kitId: string }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("misleading"),
    [details, setDetails] = useState(""),
    [status, setStatus] = useState("");
  async function submit() {
    const response = await fetch(`/api/reading-kits/${kitId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    const data = await response.json();
    setStatus(
      response.ok
        ? "Report sent for review."
        : data.error || "Could not send report.",
    );
    if (response.ok) setDetails("");
  }
  return open ? (
    <section className="rounded border p-3 space-y-2">
      <h2 className="font-display text-xl">Report this kit</h2>
      <label className="block">
        Reason
        <select
          className="block w-full rounded border p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          <option value="misleading">Misleading</option>
          <option value="spam">Spam</option>
          <option value="unsafe">Unsafe link or advice</option>
          <option value="harassment">Harassment</option>
          <option value="other">Other</option>
        </select>
      </label>
      <textarea
        aria-label="Kit report details"
        className="w-full rounded border p-2"
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />
      {status && <p role="status">{status}</p>}
      <Button
        disabled={details.trim().length < 5}
        onClick={() => void submit()}
      >
        Send kit report
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close
      </Button>
    </section>
  ) : (
    <Button variant="ghost" onClick={() => setOpen(true)}>
      Report this kit
    </Button>
  );
}

export function ModerateReadingKitReport({
  reportId,
  version,
  restore = false,
}: {
  reportId: string;
  version: number;
  restore?: boolean;
}) {
  const [note, setNote] = useState(""),
    [error, setError] = useState("");
  async function decide(action: "dismiss" | "hide" | "restore") {
    const response = await fetch(`/api/moderation/reading-kits/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version, note }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Decision failed.");
    location.reload();
  }
  return (
    <div className="space-y-2">
      <textarea
        aria-label="Kit decision note"
        className="w-full rounded border p-2"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      {restore ? (
        <Button
          disabled={note.trim().length < 5}
          onClick={() => void decide("restore")}
        >
          Restore kit
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            disabled={note.trim().length < 5}
            onClick={() => void decide("hide")}
          >
            Hide kit
          </Button>
          <Button
            variant="ghost"
            disabled={note.trim().length < 5}
            onClick={() => void decide("dismiss")}
          >
            Dismiss report
          </Button>
        </div>
      )}
    </div>
  );
}
