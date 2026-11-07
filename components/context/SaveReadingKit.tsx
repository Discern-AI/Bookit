"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function SaveReadingKit({
  kitId,
  initialSaved,
}: {
  kitId: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reading-kits/${kitId}/save`, {
        method: saved ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update this saved kit.");
      setSaved(result.saved);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update this saved kit.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1">
      <Button
        loading={busy}
        onClick={toggle}
        size="sm"
        variant={saved ? "secondary" : "primary"}
      >
        {saved ? "Remove saved kit" : "Save kit"}
      </Button>
      {error && (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
