"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
export function AccountSecurity() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [action, setAction] = useState<"password" | "signout" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (action === "password" && password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          currentPassword: current,
          ...(action === "password" ? { newPassword: password } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update security settings.");
      setCurrent("");
      setPassword("");
      setConfirm("");
      await signOut({ redirect: false });
      window.location.assign("/login");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update security settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = "block w-full rounded border border-ink-200 bg-paper-50 p-3";
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Account security</h2>
      <p>
        Changing your password or signing out devices ends all existing
        sessions, including this one. You will need to sign in again. An
        already-running request may finish.
      </p>
      <label className="block">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          maxLength={72}
          className={field}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="block">
        New password
        <input
          type="password"
          autoComplete="new-password"
          maxLength={72}
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="block">
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          maxLength={72}
          className={field}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!current || !password || !confirm}
          onClick={() => {
            setError("");
            setAction("password");
          }}
        >
          Change password
        </Button>
        <Button
          variant="secondary"
          disabled={!current}
          onClick={() => {
            setError("");
            setAction("signout");
          }}
        >
          Sign out all devices
        </Button>
      </div>
      <Modal
        open={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={
          action === "password" ? "Change password" : "Sign out all devices"
        }
      >
        <p className="mb-4">
          Continue and end all current sessions? Your library and published
          content stay unchanged.
        </p>
        <Button loading={busy} onClick={submit}>
          Confirm security change
        </Button>
        {error && (
          <p role="alert" className="text-rose-600 mt-3">
            {error}
          </p>
        )}
      </Modal>
    </section>
  );
}
