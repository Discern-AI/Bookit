"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ReportMarketplaceListing({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setStatus("");
    const response = await fetch(`/api/marketplace/${listingId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setStatus(data.error || "Could not send report.");
    setStatus("Report sent for review.");
    setDetails("");
  }
  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Report
      </Button>
    );
  return (
    <div className="w-full rounded border border-ink-200 p-3 space-y-2">
      <label className="block text-sm">
        Reason
        <select
          className="block w-full rounded border p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          <option value="misleading">Misleading listing</option>
          <option value="spam">Spam</option>
          <option value="unsafe">Unsafe link or advice</option>
          <option value="harassment">Harassment</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block text-sm">
        Details
        <textarea
          aria-label="Report details"
          className="block w-full rounded border p-2"
          minLength={5}
          maxLength={2000}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || details.trim().length < 5}
          onClick={() => void submit()}
        >
          {busy ? "Sending..." : "Send report"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function ModerateMarketplaceReport({
  reportId,
  version,
  restore = false,
}: {
  reportId: string;
  version: number;
  restore?: boolean;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(action: "dismiss" | "hide" | "restore") {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/moderation/marketplace/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version, note }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error || "Decision failed.");
    location.reload();
  }
  return (
    <div className="space-y-2">
      <textarea
        aria-label="Decision note"
        className="w-full rounded border p-2"
        minLength={5}
        maxLength={2000}
        placeholder="Decision note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        {restore ? (
          <Button
            disabled={busy || note.trim().length < 5}
            onClick={() => void decide("restore")}
          >
            Restore listing
          </Button>
        ) : (
          <>
            <Button
              disabled={busy || note.trim().length < 5}
              onClick={() => void decide("hide")}
            >
              Hide listing
            </Button>
            <Button
              variant="ghost"
              disabled={busy || note.trim().length < 5}
              onClick={() => void decide("dismiss")}
            >
              Dismiss report
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
