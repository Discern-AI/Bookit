"use client";
import { useState } from "react";
import Link from "next/link";
export function ChallengeSharing({
  challenge: c,
  reload,
}: {
  challenge: {
    id: string;
    isPublic: boolean;
    shareVersion: number;
    isCommunityCopy: boolean;
    sourceId: string | null;
    title: string;
    target: number;
    kind: string;
    startsOn: string;
    endsOn: string;
    genre: string | null;
    squares: { prompt: string }[];
  };
  reload: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<{
      version: number;
      isPublic: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/challenges/community", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, ...confirm }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await reload();
      setConfirm(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not update sharing. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (c.isCommunityCopy)
    return (
      <p className="text-sm">
        Joined community challenge. Your copy and progress are private.
        {c.sourceId && (
          <>
            {" "}
            <Link
              className="underline"
              href={`/community/challenges/discover?challenge=${c.sourceId}`}
            >
              View shared challenge
            </Link>
          </>
        )}
      </p>
    );
  return (
    <div className="border-t pt-3 space-y-3">
      <p>
        {c.isPublic
          ? "Challenge rules are shared with the community. Your books and progress remain private."
          : "This challenge is private."}
      </p>
      {c.isPublic && (
        <Link
          className="underline"
          href={`/community/challenges/discover?challenge=${c.id}`}
        >
          View shared challenge
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      {confirm ? (
        <div className="space-y-3">
          {confirm.isPublic ? (
            <>
              <h3 className="font-semibold">Preview what readers will see</h3>
              <p className="break-words">{c.title}</p>
              <p>
                {c.startsOn} to {c.endsOn} /{" "}
                {c.kind === "bingo" ? "Nine-square bingo" : `${c.target} books`}
                {c.genre ? ` / ${c.genre}` : ""}
              </p>
              {c.kind === "bingo" && (
                <ol className="list-decimal pl-6">
                  {c.squares.map((s, i) => (
                    <li key={i} className="break-words">
                      {s.prompt}
                    </li>
                  ))}
                </ol>
              )}
              <p>
                Only the information above will be shared. Your account name,
                selected books, notes, sponsor records and progress stay private. Readers who
                join keep their own copy if you later withdraw this challenge.
              </p>
            </>
          ) : (
            <p>
              Stop new readers joining? Existing private copies will be kept.
            </p>
          )}
          <button
            className="border rounded px-3 py-2"
            disabled={busy}
            onClick={save}
          >
            {confirm.isPublic ? "Confirm sharing" : "Confirm withdrawal"}
          </button>{" "}
          <button
            disabled={busy}
            onClick={() => {
              setConfirm(null);
              setError("");
            }}
          >
            Cancel sharing change
          </button>
          {error && (
            <button
              className="underline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await reload();
                  setConfirm(null);
                  setError("");
                } catch {
                  setError("Could not reload. Please retry.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload sharing status
            </button>
          )}
        </div>
      ) : (
        <button
          className="underline"
          onClick={() => {
            setError("");
            setConfirm({ version: c.shareVersion, isPublic: !c.isPublic });
          }}
        >
          {c.isPublic ? "Withdraw shared challenge" : "Share challenge rules"}
        </button>
      )}
    </div>
  );
}
