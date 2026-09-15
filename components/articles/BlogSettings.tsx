"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function BlogSettings({
  enabled,
  version,
}: {
  enabled: boolean;
  version: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/settings/blog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled, version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {enabled ? "Disable public blog" : "Enable public blog"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={enabled ? "Disable public blog" : "Enable public blog"}
      >
        <p className="mb-4">
          {enabled
            ? "Hide all your public articles, Blog tab and RSS feed? Saved drafts and published versions will remain available privately."
            : "Enable your public blog? Articles you explicitly publish will be visible to anyone when your profile is public. Previously published articles will become visible again. Drafts stay private."}
        </p>
        <Button loading={busy} onClick={save}>
          Confirm blog setting
        </Button>
        {error && (
          <p role="alert" className="text-rose-600 mt-3">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
