"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function ShareShelf({
  id,
  name,
  isPublic,
  version,
}: {
  id: string;
  name: string;
  isPublic: boolean;
  version: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(isPublic);
  const [currentVersion, setCurrentVersion] = useState(version);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shelves/${id}/sharing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !shared, version: currentVersion }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not save. Try again.");
      setOpen(false);
      setShared(!shared);
      setCurrentVersion((saved) => saved + 1);
      window.location.reload();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {shared ? "Stop sharing" : "Share shelf"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={shared ? "Stop sharing shelf" : "Publish shelf"}
      >
        <p className="mb-3">
          {shared
            ? `Hide ${name} and its public page?`
            : `Publish ${name}? Anyone will see its name, book titles, authors and edition details.`}
        </p>
        {!shared && (
          <p className="text-sm text-ink-500 mb-4">
            This is a live shelf: renaming it or adding/removing books updates
            the public page. Notes, ratings, reading status and dates stay
            private. Hiding your profile hides this shelf; republishing your
            profile restores its visibility.
          </p>
        )}
        <Button loading={busy} onClick={save}>
          {shared ? "Confirm stop sharing" : "Confirm publish"}
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
