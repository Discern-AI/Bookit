"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
export function FollowPath({
  id,
  initialFollowing,
}: {
  id: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/paths/${id}/follow`, {
        method: following ? "DELETE" : "PUT",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFollowing(data.following);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button disabled={busy} onClick={toggle}>
        {following ? "Unfollow path" : "Follow path"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
export function SharePath() {
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setMessage("Link copied.");
          } catch {
            setMessage("Copy the link from your browser address bar.");
          }
        }}
      >
        Copy public link
      </Button>
      {message && (
        <p role="status" className="text-sm text-ink-500">
          {message}
        </p>
      )}
    </div>
  );
}
