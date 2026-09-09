"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
export function GiftSharing({
  contactId,
  name,
  token,
  version,
}: {
  contactId: string;
  name: string;
  token: string | null;
  version: number;
}) {
  const [confirm, setConfirm] = useState<
    "enable" | "rotate" | "disable" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");
  const router = useRouter();
  useEffect(() => setOrigin(window.location.origin), []);
  async function change() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/gifts/${contactId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: confirm, version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirm(null);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sharing could not be changed.",
      );
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded border border-ink-200 p-4 space-y-3">
      <h2 className="font-display text-xl">Gift-list sharing</h2>
      {token ? (
        <>
          <p className="text-sm text-ink-500">
            Anyone with this link can see the recipient name, books,
            availability and claim state. Your preferences, occasions, budget,
            price estimates and private notes stay hidden.
          </p>
          <Input
            aria-label="Shared gift link"
            readOnly
            value={`${origin}/gift/${token}`}
            onFocus={(e) => e.target.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/gift/${token}`,
                  );
                  setCopied("Link copied.");
                } catch {
                  setCopied("Select and copy the link above.");
                }
              }}
            >
              Copy link
            </Button>
            <a
              href={`/gift/${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-shelf-700 px-2 py-1"
            >
              Preview shared list
            </a>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm("rotate")}
            >
              Replace link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm("disable")}
            >
              Stop sharing
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-500">
            This list has no active shared link.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirm("enable")}
          >
            Share this list
          </Button>
        </>
      )}
      {copied && (
        <p role="status" className="text-sm text-ink-500">
          {copied}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {confirm && (
        <Modal
          open
          title={
            confirm === "enable"
              ? "Create a shared gift link?"
              : confirm === "rotate"
                ? "Replace the shared link?"
                : "Stop sharing this list?"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="mb-4">
            {confirm === "enable"
              ? `Anyone with the link will see ${name}'s name, book ideas, availability and claim state. Preferences, occasions, budget, price estimates and private notes remain hidden. Signed-in readers can claim books. The link will not be listed in Browse.`
              : confirm === "rotate"
                ? "The old link will stop working. Existing claims stay in place; you can release them from this private list."
                : "The shared link will stop working. Existing claims stay in place and can still be released from this private list."}
          </p>
          <div className="flex gap-3">
            <Button loading={busy} onClick={change}>
              {confirm === "enable"
                ? "Create shared link"
                : confirm === "rotate"
                  ? "Confirm replacement"
                  : "Confirm stop sharing"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
