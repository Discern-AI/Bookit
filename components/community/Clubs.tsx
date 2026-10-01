"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ClubSummary } from "@/lib/clubs";
const field = "block w-full border border-ink-200 rounded p-2 bg-paper-50";
export function Clubs() {
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubSummary[]>([]),
    [mine, setMine] = useState(true),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [isPublic, setPublic] = useState(false),
    [alias, setAlias] = useState(""),
    [creating, setCreating] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const [invite, setInvite] = useState(""),
    [preview, setPreview] = useState<ClubSummary | null>(null),
    [joinAlias, setJoinAlias] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/clubs?mine=${mine}&page=${page}`, { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setClubs(d.clubs);
        setMore(d.hasMore);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [mine, page, attempt]);
  async function send(url: string, method: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <Link href="/community" className="underline">
        Community
      </Link>
      <h1 className="font-display text-4xl">Book clubs</h1>
      <p>
        Read together, make room for discussion. Your private bookshelf and
        notes stay yours.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Reload clubs
          </Button>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant={mine ? "primary" : "secondary"}
          onClick={() => {
            setMine(true);
            setPage(0);
          }}
        >
          My clubs
        </Button>
        <Button
          variant={!mine ? "primary" : "secondary"}
          onClick={() => {
            setMine(false);
            setPage(0);
          }}
        >
          Discover open clubs
        </Button>
        <Button variant="secondary" onClick={() => setCreating(!creating)}>
          Create a club
        </Button>
      </div>
      {creating && (
        <form
          aria-label="Create book club"
          className="p-4 bg-paper-100 rounded space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await send("/api/clubs", "POST", {
              id,
              name,
              description,
              isPublic,
              alias,
            });
            if (d) router.push(`/community/clubs/${d.id}`);
          }}
        >
          <label className="block">
            Club name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            Description
            <textarea
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            Your club display name
            <input
              required
              maxLength={60}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setPublic(e.target.checked)}
            />{" "}
            List as an open club anyone signed in can join
          </label>
          <p className="text-sm text-ink-500">
            Private by default. Open clubs share their name, description and
            member count in discovery. Discussion stays members-only. Members
            see your chosen club display name.
          </p>
          <Button loading={busy}>Save new club</Button>
        </form>
      )}
      <section
        aria-label="Club directory"
        className="grid sm:grid-cols-2 gap-4"
      >
        {loading ? (
          <p role="status">Loading clubs...</p>
        ) : !clubs.length ? (
          <p>
            {mine ? "You have not joined a club yet." : "No open clubs yet."}
          </p>
        ) : (
          clubs.map((c) => (
            <article
              key={c.id}
              className="bg-paper-100 rounded p-4 shadow-card space-y-2"
            >
              <h2 className="font-display text-xl break-words">
                <Link href={`/community/clubs/${c.id}`}>{c.name}</Link>
              </h2>
              <p className="whitespace-pre-wrap break-words">{c.description}</p>
              <p className="text-xs">
                {c.isPublic ? "Open" : "Private"} / {c.memberCount} members
              </p>
              <Link
                className="underline text-shelf-700"
                href={`/community/clubs/${c.id}`}
              >
                {c.membership?.active ? "Open club" : "View and join"}
              </Link>
            </article>
          ))
        )}
      </section>
      <div className="flex gap-3">
        {page > 0 && (
          <Button variant="secondary" onClick={() => setPage((p) => p - 1)}>
            Previous clubs
          </Button>
        )}
        {more && (
          <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
            More clubs
          </Button>
        )}
      </div>
      <section
        className="border rounded p-4 space-y-3"
        aria-label="Join by invitation"
      >
        <h2 className="font-display text-xl break-words">
          Have an invitation?
        </h2>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPreview(null);
            const d = await send("/api/clubs/invite", "POST", {
              invite: invite.trim(),
            });
            if (d) setPreview(d.club);
          }}
        >
          <label>
            Invitation code
            <input
              className={field}
              required
              value={invite}
              autoComplete="off"
              onChange={(e) => {
                setInvite(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <Button variant="secondary" loading={busy}>
            Check invitation
          </Button>
        </form>
        {preview && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await send(`/api/clubs/${preview.id}`, "PATCH", {
                action: "join",
                version: preview.version,
                membershipVersion: preview.membership?.version ?? null,
                alias: joinAlias,
                invite: invite.trim(),
              });
              if (d) router.push(`/community/clubs/${preview.id}`);
            }}
          >
            <h3 className="font-display text-xl break-words">{preview.name}</h3>
            <p>{preview.description}</p>
            <label>
              Your club display name
              <input
                className={field}
                required
                maxLength={60}
                value={joinAlias}
                onChange={(e) => setJoinAlias(e.target.value)}
              />
            </label>
            <p className="text-sm">
              This name and any posts you choose to write will be shared with
              club members.
            </p>
            <Button loading={busy}>Join invited club</Button>
          </form>
        )}
      </section>
    </div>
  );
}
