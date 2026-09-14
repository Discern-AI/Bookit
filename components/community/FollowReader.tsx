"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
export function FollowReader({
  readerId,
  initialFollowing,
}: {
  readerId: string;
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
      const response = await fetch(`/api/readers/${readerId}/follow`, {
        method: following ? "DELETE" : "PUT",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update your follow.");
      setFollowing(result.following);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update your follow. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button
        onClick={toggle}
        loading={busy}
        variant={following ? "secondary" : "primary"}
      >
        {following ? "Unfollow" : "Follow reader"}
      </Button>
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
