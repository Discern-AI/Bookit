"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function FollowAuthor({ author, initialFollowed }: { author: string; initialFollowed: boolean }) {
  const [followed, setFollowed] = useState(initialFollowed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setSaving(true);
    setError("");
    try {
      const url = "/api/authors/follows";
      const res = followed
        ? await fetch(`${url}?author=${encodeURIComponent(author)}`, { method: "DELETE" })
        : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update this author follow.");
      setFollowed(data.followed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this author follow.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant={followed ? "secondary" : "primary"} size="sm" onClick={() => void toggle()} disabled={saving}>
        {saving ? "Saving..." : followed ? "Following author" : "Follow author"}
      </Button>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
