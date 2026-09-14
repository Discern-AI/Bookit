"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function DeleteReview({
  id,
  workId,
  version,
  title,
}: {
  id: string;
  workId: string;
  version: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reviews/${workId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, version }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not delete. Try again.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not delete. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        Delete review
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Delete review"
      >
        <p className="mb-3">
          Delete your review of {title}? This cannot be undone.
        </p>
        <p className="mb-4 text-sm text-ink-500">
          The review text and rating will be removed, along with its public
          discussion and likes. Report snapshots stay available to moderators,
          and comment authors can still manage their own comments. Your library
          book, private notes and library rating stay unchanged.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Keep review
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            Confirm deletion
          </Button>
        </div>
        {error && (
          <p className="text-rose-600 mt-3" role="alert">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
