"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function ReviewToArticle({
  reviewId,
  version,
}: {
  reviewId: string;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/articles/from-review/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/creator/${data.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create draft.");
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Turn into article
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Turn review into article"
      >
        <p className="mb-4">
          Copy your saved review text into a private article draft? Your review
          stays unchanged. Notes, ratings and reading history are excluded. If
          you already created an article from this review version, it will
          reopen.
        </p>
        <Button loading={busy} onClick={create}>
          Create private article draft
        </Button>
        {error && (
          <p role="alert" className="mt-3">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
