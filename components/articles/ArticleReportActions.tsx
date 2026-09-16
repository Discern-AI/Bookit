"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function ReportArticle({
  articleId,
  publishedVersion,
}: {
  articleId: string;
  publishedVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details, publishedVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false);
      setDetails("");
      setMessage("Report submitted privately to moderators.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not submit report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Report article
      </Button>
      {message && !open && <p role="status">{message}</p>}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Report article"
      >
        <div className="space-y-4">
          <p>
            Moderators receive this published version and your explanation.
            Reports are private.
          </p>
          <label className="block">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full border rounded p-2"
            >
              {["spam", "harassment", "spoilers", "other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Report details
            <textarea
              value={details}
              maxLength={2000}
              onChange={(e) => setDetails(e.target.value)}
              className="block w-full border rounded p-2"
            />
          </label>
          <Button loading={busy} onClick={submit}>
            Submit article report
          </Button>
          {message && <p role="alert">{message}</p>}
        </div>
      </Modal>
    </>
  );
}
export function ModerateArticle({
  reportId,
  version,
  restore = false,
}: {
  reportId: string;
  version: number;
  restore?: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"hide" | "dismiss" | "restore" | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/moderation/articles/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAction(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex gap-3">
        {restore ? (
          <Button variant="secondary" onClick={() => setAction("restore")}>
            Lift article restriction
          </Button>
        ) : (
          <>
            <Button variant="danger" onClick={() => setAction("hide")}>
              Hide article
            </Button>
            <Button variant="secondary" onClick={() => setAction("dismiss")}>
              Dismiss article report
            </Button>
          </>
        )}
      </div>
      <Modal
        open={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title="Confirm article moderation"
      >
        <p>
          {action === "hide"
            ? "Hide this article and its images from all public views, and block republishing? The author can still edit their private draft."
            : action === "restore"
              ? "Lift this restriction? The article will remain unpublished until its author explicitly publishes it again."
              : "Dismiss this report without changing the article?"}
        </p>
        <label className="block my-4">
          Decision note
          <textarea
            className="block w-full border rounded p-2"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button loading={busy} onClick={submit}>
          Confirm {action}
        </Button>
        {error && <p role="alert">{error}</p>}
      </Modal>
    </>
  );
}
