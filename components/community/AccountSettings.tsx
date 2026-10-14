"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function AccountSettings({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function submit(action: "name" | "delete") {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/settings/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "name"
            ? { action, name }
            : { action, currentPassword: password, confirmation },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not update your account.");
      if (action === "name") {
        setStatus("Account name saved.");
        router.refresh();
      } else {
        try {
          localStorage.removeItem(`folio:article-recovery-enabled:${userId}`);
          for (const key of Object.keys(localStorage))
            if (key.startsWith(`folio:article-recovery:${userId}:`))
              localStorage.removeItem(key);
        } catch {
          /* Browser storage may be unavailable. Account deletion has succeeded. */
        }
        await signOut({ redirect: false }).catch(() => undefined);
        window.location.assign("/login?deleted=1");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update your account.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = "block w-full rounded border border-ink-200 bg-paper-50 p-3";
  return (
    <section aria-label="Account details" className="space-y-4">
      <h2 className="font-display text-2xl">Account details</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit("name");
        }}
      >
        <label>
          Private account name
          <input
            className={field}
            value={name}
            maxLength={100}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p>Your public profile name is managed separately.</p>
        <Button loading={busy} disabled={!name.trim()}>
          Save account name
        </Button>
      </form>
      {status && <p role="status">{status}</p>}
      {!open && error && <p role="alert">{error}</p>}
      <h3 className="font-display text-xl">Delete account</h3>
      <p>
        Permanently remove your account, library, reading history, imports, gift
        lists, profiles, reviews, comments, paths and articles, including
        uploaded article images. Gift claims you made on other lists will be
        released. Your saved chats, journal entries and club posts are removed.
        Clubs you own and all their discussions are deleted for every member.
        Shared challenges are withdrawn; other readers keep copies they already
        joined. Threads you started and their replies are deleted for every
        reader. This cannot be undone.
      </p>
      <p>
        Shared catalogue books and other readers&apos; accounts remain.
        Downloads and copies stored on other devices cannot be removed here.
        Close other open Folio tabs before deleting; optional article recovery
        copies on this browser will be cleared where browser storage permits.
      </p>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setError("");
          setPassword("");
          setConfirmation("");
          setOpen(true);
        }}
      >
        Delete my account
      </Button>
      <Modal
        open={open}
        title="Permanently delete account"
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setPassword("");
            setConfirmation("");
            setError("");
          }
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("delete");
          }}
        >
          <p>
            This deletes your saved account data and ends access on all devices.
            Clubs you own and all their discussions are also deleted for every
            member. Enter your current password and type DELETE to confirm.
          </p>
          <label className="block">
            Password for account deletion
            <input
              className={field}
              type="password"
              autoComplete="current-password"
              maxLength={72}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            Type DELETE
            <input
              className={field}
              autoComplete="off"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <Button
            loading={busy}
            disabled={!password || confirmation !== "DELETE"}
          >
            Permanently delete my account
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Modal>
    </section>
  );
}
