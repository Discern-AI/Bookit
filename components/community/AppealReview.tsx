"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function AppealReview({
  workId,
  moderationVersion,
}: {
  workId: string;
  moderationVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/appeals/${workId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, moderationVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false);
      setReason("");
      setMessage("Appeal submitted. Check Your appeals for a response.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
      >
        Appeal restriction
      </Button>
      {!open && message && <p role="status">{message}</p>}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Appeal review restriction"
      >
        <form onSubmit={submit} className="space-y-4">
          <p>
            Explain why this review should be restored. Only you and moderators
            can see your appeal. Review is manual; no response time is
            guaranteed.
          </p>
          <label className="block">
            Appeal explanation
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              className="block w-full border border-ink-200 rounded p-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" loading={busy}>
            Submit appeal
          </Button>
          {message && <p role="alert">{message}</p>}
        </form>
      </Modal>
    </div>
  );
}
export function DecideAppeal({
  appealId,
  reviewId,
  reviewVersion,
}: {
  appealId: string;
  reviewId: string;
  reviewVersion: number;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"restore" | "reject" | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/moderation/appeals/${appealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewId,
          reviewVersion,
          response: responseText,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAction(null);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not resolve appeal.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex gap-3">
        <Button
          size="sm"
          onClick={() => {
            setError("");
            setAction("restore");
          }}
        >
          Lift restriction
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setError("");
            setAction("reject");
          }}
        >
          Reject appeal
        </Button>
      </div>
      <Modal
        open={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={
          action === "restore" ? "Lift review restriction" : "Reject appeal"
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <p>
            {action === "restore"
              ? "Lift the restriction across this reader's review versions for this book? Only an existing published review on a public profile becomes visible. Deleted reviews and private drafts remain unavailable publicly."
              : "Reject this appeal and keep the restriction?"}
          </p>
          <label className="block">
            Explanation for the reader
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              className="block w-full border border-ink-200 rounded p-3"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
            />
          </label>
          <Button type="submit" loading={busy}>
            Confirm decision
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
