"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
export function DismissReminder({
  contactId,
  occasionId,
  occurrence,
}: {
  contactId: string;
  occasionId: string;
  occurrence: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch(`/api/gifts/${contactId}/dismiss`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ occasionId, occurrence }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Dismiss reminder
      </Button>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
