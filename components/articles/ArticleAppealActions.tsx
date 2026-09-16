"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function AppealArticle({
  articleId,
  moderationVersion,
}: {
  articleId: string;
  moderationVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/appeals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, moderationVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false);
      setReason("");
      setMessage("Appeal submitted privately.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not submit appeal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Appeal article restriction
      </Button>{" "}
      <Link className="underline" href="/creator/appeals">
        Your article appeals
      </Link>
      {message && !open && <p role="status">{message}</p>}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Appeal article restriction"
      >
        <p>
          Your explanation and the hidden published article go to moderators.
          Unpublished draft edits stay private. One appeal is allowed for each
          moderation decision.
        </p>
        <label className="block my-4">
          Appeal explanation
          <textarea
            className="block w-full border border-ink-200 rounded p-2"
            value={reason}
            minLength={10}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button loading={busy} onClick={submit}>
          Submit article appeal
        </Button>
        {message && <p role="alert">{message}</p>}
      </Modal>
    </div>
  );
}
export function DecideArticleAppeal({
  appealId,
  version,
}: {
  appealId: string;
  version: number;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"restore" | "reject" | null>(null);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide() {
    setBusy(true);
    setError("");
    try {
      const result = await fetch(
        `/api/moderation/article-appeals/${appealId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, version, response }),
        },
      );
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setAction(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve appeal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setAction("restore")}>
          Approve article appeal
        </Button>
        <Button variant="secondary" onClick={() => setAction("reject")}>
          Reject article appeal
        </Button>
      </div>
      <Modal
        open={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title="Confirm article appeal decision"
      >
        <p>
          {action === "restore"
            ? "Lift the restriction? The article stays unpublished until its author chooses to publish it again."
            : "Keep the restriction and reject this appeal?"}
        </p>
        <label className="block my-4">
          Appeal response
          <textarea
            className="block w-full border border-ink-200 rounded p-2"
            value={response}
            minLength={10}
            maxLength={2000}
            onChange={(e) => setResponse(e.target.value)}
          />
        </label>
        <Button loading={busy} onClick={decide}>
          Confirm appeal {action}
        </Button>
        {error && <p role="alert">{error}</p>}
      </Modal>
    </>
  );
}
