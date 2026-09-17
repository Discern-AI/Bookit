"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
export function AccountLinkRequest({ action }: { action: "reset" | "email" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const response = await fetch("/api/account-links/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              email,
              ...(action === "email" ? { currentPassword: password } : {}),
            }),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not request a link.");
          setPassword("");
          setMessage(
            action === "reset"
              ? "If an account matches this email, a reset link has been sent. Check your inbox. Allow a minute before requesting another link."
              : "Check your new email for a confirmation link. Your login email stays unchanged until you confirm. Allow a minute before requesting another link.",
          );
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not request a link.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-display text-2xl">
        {action === "reset" ? "Reset your password" : "Change login email"}
      </h2>
      <p>
        {action === "reset"
          ? "Request a link to choose a new password."
          : "Confirm your current password, then verify the new address using the link sent to it. Confirmation signs out all devices."}
      </p>
      <label className="block">
        {action === "reset" ? "Account email" : "New login email"}
        <input
          className="block w-full border border-ink-200 rounded p-3"
          type="email"
          maxLength={254}
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {action === "email" && (
        <label className="block">
          Current password for email change
          <input
            className="block w-full border border-ink-200 rounded p-3"
            type="password"
            maxLength={72}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <Button loading={busy}>
        {action === "reset" ? "Send reset link" : "Send email confirmation"}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
