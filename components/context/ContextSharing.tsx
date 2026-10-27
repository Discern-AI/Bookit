"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { ContextSelection } from "@/lib/context-sharing";
import type { DiaryEntry } from "@/lib/context-diary";
export function ContextSharing({
  value,
  onChange,
  disabled,
}: {
  value: ContextSelection | null;
  onChange: (v: ContextSelection | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [version, setVersion] = useState(0),
    [page, setPage] = useState(1),
    [next, setNext] = useState(false),
    [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [profileAvailable, setProfileAvailable] = useState(false),
    [profile, setProfile] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [preview, setPreview] = useState("");
  function reset() {
    onChange(null);
    setPreview("");
  }
  async function load(p = 1) {
    setLoading(true);
    setError("");
    reset();
    setIds([]);
    setProfile(false);
    setEntries([]);
    setProfileAvailable(false);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/context"),
        fetch(`/api/context/diary?page=${p}`),
      ]);
      const [c, d] = await Promise.all([a.json(), b.json()]);
      if (!a.ok || !b.ok || !c.available || !d.available)
        throw Error(
          "Personal context is unavailable. Check your saved context and server key.",
        );
      if (c.version !== d.contextVersion)
        throw Error("Context changed while loading. Reload to review it.");
      setVersion(c.version);
      setProfileAvailable(
        !!c.profile &&
          (c.profile.lifeContext !== "" ||
            c.profile.readingTimes.length > 0 ||
            c.profile.timeAvailable !== "Not specified"),
      );
      setEntries(d.entries);
      setPage(p);
      setNext(d.hasNext);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load context.");
    } finally {
      setLoading(false);
    }
  }
  async function review() {
    reset();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/context/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextVersion: version,
          profile,
          diaryIds: ids,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setPreview(JSON.stringify(d.context, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview context.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section
      aria-label="Personal context sharing"
      className="border rounded p-3 mb-3 space-y-3"
    >
      <p>
        {value
          ? `Next AI request: ${value.profile ? "profile and " : ""}${value.diaryIds.length} diary entries selected.`
          : "Personal context sharing is off."}
      </p>
      <p className="text-sm">
        Optional: send saved personal context to Claude for one request.
        Selection clears when used, including failed requests. Replies may
        reflect it and remain in saved private chat or a selected book journal.
        Turning sharing off or deleting context cannot recall earlier requests
        or replies; earlier conversation messages may be sent again. Start a new
        conversation to leave earlier replies out.
      </p>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || loading}
        onClick={() => {
          setOpen(!open);
          reset();
          if (!open) void load();
        }}
      >
        {" "}
        {open ? "Close context selection" : "Choose personal context"}{" "}
      </Button>
      {value && (
        <Button type="button" disabled={disabled} onClick={reset}>
          Remove context from next request
        </Button>
      )}
      {open && (
        <fieldset disabled={disabled || loading} className="space-y-3 min-w-0">
          <Link className="underline" href="/settings/context">
            Manage saved context
          </Link>
          <label className="block">
            <input
              type="checkbox"
              checked={profile}
              disabled={!profileAvailable}
              onChange={(e) => {
                reset();
                setProfile(e.target.checked);
              }}
            />{" "}
            Include saved context profile
          </label>
          <p>
            Choose up to three diary entries on this page. Changing pages clears
            the selection.
          </p>
          {entries.map((e) => (
            <label key={e.id} className="block border p-2 break-words">
              <input
                type="checkbox"
                aria-label={`Share diary entry ${e.id}`}
                disabled={
                  e.text === null || (!ids.includes(e.id) && ids.length >= 3)
                }
                checked={ids.includes(e.id)}
                onChange={(v) => {
                  reset();
                  setIds(
                    v.target.checked
                      ? [...ids, e.id]
                      : ids.filter((id) => id !== e.id),
                  );
                }}
              />{" "}
              {new Date(e.createdAt).toLocaleString()}
              <span className="block whitespace-pre-wrap">
                {e.text === null
                  ? "Cannot decrypt this entry"
                  : e.text.slice(0, 160)}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={page === 1}
              onClick={() => void load(page - 1)}
            >
              Previous diary page
            </Button>
            <span>Page {page}</span>
            <Button
              type="button"
              disabled={!next}
              onClick={() => void load(page + 1)}
            >
              Next diary page
            </Button>
            <Button type="button" onClick={() => void load(page)}>
              Reload context choices
            </Button>
          </div>
          <Button
            type="button"
            disabled={!profile && !ids.length}
            onClick={() => void review()}
          >
            Preview selected context
          </Button>
          {preview && (
            <>
              <pre
                aria-label="Context to share"
                className="whitespace-pre-wrap break-words max-h-64 overflow-auto text-sm"
              >
                {preview}
              </pre>
              <Button
                type="button"
                onClick={() => {
                  onChange({ contextVersion: version, profile, diaryIds: ids });
                  setPreview("");
                  setOpen(false);
                }}
              >
                Use reviewed context for next request
              </Button>
            </>
          )}
        </fieldset>
      )}
      {loading && <p role="status">Loading context choices...</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
