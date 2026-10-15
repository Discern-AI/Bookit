"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
export function VideoPostingFiles({
  projectId,
  clipId,
}: {
  projectId: string;
  clipId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/video-projects/${projectId}/export?clip=${clipId}`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "Could not download posting files.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "folio-posting-files.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not download posting files.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Posting files"
      className="border rounded p-3 space-y-2"
    >
      <h3 className="font-display text-xl">Posting files</h3>
      <p>
        Download a ZIP with the saved video, saved captions (if any), and a
        book-credit list. Scripts, production notes and unsaved edits are
        excluded. Downloading does not publish your video or change its status.
      </p>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing posting files..." : "Download posting files"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
