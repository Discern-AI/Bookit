"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function DiscussionActions({
  reviewId,
  liked,
  likeCount,
  canComment,
}: {
  reviewId: string;
  liked: boolean;
  likeCount: number;
  canComment: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState("");
  async function send(comment: boolean) {
    setBusy(true);
    setError("");
    const id = requestId || crypto.randomUUID();
    if (comment) setRequestId(id);
    try {
      const response = await fetch(`/api/review-discussions/${reviewId}`, {
        method: comment ? "POST" : liked ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        ...(comment ? { body: JSON.stringify({ id, body }) } : {}),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save. Try again.");
      if (comment) {
        setBody("");
        setRequestId("");
      }
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Button variant="secondary" disabled={busy} onClick={() => send(false)}>
        {liked ? "Unlike" : "Like"} ({likeCount})
      </Button>
      {canComment ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(true);
          }}
          className="space-y-3"
        >
          <label className="block">
            Public comment
            <textarea
              required
              maxLength={2000}
              rows={3}
              disabled={busy}
              className="block w-full rounded border border-ink-200 p-3 bg-paper-50"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p className="text-sm text-ink-500">
            Your comment and public display name will be visible to anyone.
            Hiding your profile hides your comments.
          </p>
          <Button loading={busy} type="submit">
            Post comment
          </Button>
        </form>
      ) : (
        <p>Publish your profile in Settings to post comments.</p>
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
export function ReportContent({
  reviewId,
  commentId,
}: {
  reviewId: string;
  commentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/review-discussions/${reviewId}?action=report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId, reason, details }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not submit report.");
      setOpen(false);
      setDetails("");
      setMessage(
        "Report recorded privately for moderator review. No immediate action is guaranteed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not submit report.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(true);
          setMessage("");
        }}
      >
        Report {commentId ? "comment" : "review"}
      </Button>
      {!open && message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Report content"
      >
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm">
            Reports are private to moderators. Reporting does not automatically
            hide content.
          </p>
          <label className="block">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full p-2 border border-ink-200 rounded"
            >
              {["spam", "harassment", "spoilers", "other"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Details (optional)
            <textarea
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="block w-full p-2 border border-ink-200 rounded"
            />
          </label>
          <Button type="submit" loading={busy}>
            Submit report
          </Button>
          {message && <p role="alert">{message}</p>}
        </form>
      </Modal>
    </div>
  );
}
export function RemoveComment({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    try {
      const response = await fetch(`/api/review-comments/${commentId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not remove comment. Try again.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not remove comment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Remove comment
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Remove comment"
      >
        <p className="mb-4">
          Remove this comment from public discussion? Moderators can still
          access it if it was reported.
        </p>
        <Button variant="danger" loading={busy} onClick={remove}>
          Confirm removal
        </Button>
        {error && <p role="alert">{error}</p>}
      </Modal>
    </>
  );
}
export function ModerateReport({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function resolve(action: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/moderation/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfirm(false);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not resolve report.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Button size="sm" disabled={busy} onClick={() => setConfirm(true)}>
          Hide content
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => resolve("dismiss")}
        >
          Dismiss report
        </Button>
      </div>
      <Modal
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        title="Hide reported content"
      >
        <p className="mb-4">
          Hide this content from public pages? Hiding a review also hides its
          discussion.
        </p>
        <Button variant="danger" loading={busy} onClick={() => resolve("hide")}>
          Confirm hide
        </Button>
        {error && <p role="alert">{error}</p>}
      </Modal>
      {!confirm && error && <p role="alert">{error}</p>}
    </div>
  );
}
