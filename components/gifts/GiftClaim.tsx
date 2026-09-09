"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function GiftClaim({
  endpoint,
  version,
  claimed,
  mine,
  canRelease,
  available,
  ownerControl = false,
}: {
  endpoint: string;
  version: number;
  claimed: boolean;
  mine: boolean;
  canRelease: boolean;
  available: boolean;
  ownerControl?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  async function change() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: claimed ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That claim could not be changed.",
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {!ownerControl && (
        <p className="text-sm text-ink-500">
          {!available
            ? "Already arranged"
            : claimed
              ? mine
                ? "You claimed this gift"
                : "Claimed"
              : "Available to claim"}
        </p>
      )}
      {((claimed && canRelease) || (!claimed && available)) && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => (ownerControl ? setConfirm(true) : void change())}
        >
          {claimed ? "Release claim" : "Claim this gift"}
        </Button>
      )}
      {error && (
        <div role="alert" className="text-sm text-rose-700">
          {error}{" "}
          <button onClick={() => router.refresh()} className="underline">
            Refresh list
          </button>
        </div>
      )}
      {confirm && (
        <Modal
          open
          title="Release this claim?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p className="mb-4">
            This makes the book available for someone else to claim if it is
            still planned.
          </p>
          <div className="flex gap-3">
            <Button loading={busy} onClick={change}>
              Confirm release
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep claim
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
