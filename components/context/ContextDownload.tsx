"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
export function ContextDownload({ disabled = false }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/context/export");
      if (!r.ok) {
        const d = await r.json();
        throw Error(d.error || "Could not download context.");
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "folio-private-context.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download context.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || busy}
        onClick={() => void download()}
      >
        Download saved context
      </Button>
      <p className="text-sm">
        Downloads your saved profile and all diary entries as readable personal
        text. Unsaved edits are excluded. This is separate from your library
        export.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
