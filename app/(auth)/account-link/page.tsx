"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
export default function Page() {
  const [token, setToken] = useState("");
  const [action, setAction] = useState("reset");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setToken(params.get("token") || "");
    setAction(params.get("action") || "reset");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">
        {action === "email" ? "Confirm email change" : "Choose a new password"}
      </h1>
      {done ? (
        <p role="status">
          {action === "email"
            ? "Email changed. Sign in using your new address."
            : "Password reset. Sign in using your new password."}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (action === "reset" && password !== confirm) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            try {
              const response = await fetch("/api/account-links/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action,
                  token,
                  ...(action === "reset" ? { password } : {}),
                }),
              });
              const data = await response.json();
              if (!response.ok)
                throw new Error(
                  data.error || "Could not complete this change.",
                );
              setDone(true);
              setToken("");
              setPassword("");
              setConfirm("");
              await signOut({ redirect: false }).catch(() => undefined);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not complete this change.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            This link works once and expires after 30 minutes. Continuing ends
            all existing sign-in sessions. If you refresh this page, reopen the
            link from your email.
          </p>
          {action === "reset" && (
            <>
              <label className="block">
                New password
                <input
                  className="block w-full border border-ink-200 rounded p-3"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="block">
                Confirm new password
                <input
                  className="block w-full border border-ink-200 rounded p-3"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            </>
          )}
          {!token && (
            <p role="alert">Open a valid link from your email to continue.</p>
          )}
          <Button loading={busy} disabled={!token}>
            {action === "email" ? "Confirm new email" : "Reset password"}
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <Link className="underline block" href="/login">
        Back to login
      </Link>
      <Link className="underline block" href="/forgot-password">
        Request a password reset
      </Link>
    </div>
  );
}
