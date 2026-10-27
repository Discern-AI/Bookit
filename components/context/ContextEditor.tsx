"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ContextDownload } from "./ContextDownload";
import { Button } from "@/components/ui/Button";
import {
  emptyContext,
  READING_TIMES,
  READING_BUDGETS,
  type ContextProfile,
} from "@/lib/reading-context";
export function ContextEditor() {
  const [draft, setDraft] = useState<ContextProfile>(emptyContext),
    [saved, setSaved] = useState(JSON.stringify(emptyContext)),
    [version, setVersion] = useState(0),
    [hasData, setHasData] = useState(false),
    [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [confirm, setConfirm] = useState(false),
    [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const dirty = JSON.stringify(draft) !== saved;
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/context", { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load context.");
        if (c.signal.aborted) return;
        setVersion(d.version);
        setHasData(d.hasData);
        setAvailable(d.available);
        if (d.profile) {
          setDraft(d.profile);
          setSaved(JSON.stringify(d.profile));
        }
        setError(d.error || "");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(profile = draft, remove = false) {
    if (inFlight.current || (!remove && JSON.stringify(profile) === saved))
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await fetch("/api/context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          remove
            ? { action: "delete", version }
            : { action: "save", version, profile },
        ),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save context.");
      setDraft(d.profile);
      setSaved(JSON.stringify(d.profile));
      setVersion(d.version);
      setHasData(d.hasData);
      setStatus(
        remove ? "Context deleted. Your library is unchanged." : "Saved.",
      );
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save context.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function update(next: ContextProfile) {
    setDraft(next);
    void save(next);
  }
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link
        className="underline"
        href="/settings"
        onClick={(e) => {
          if (
            dirty &&
            !window.confirm("Leave without saving your context changes?")
          )
            e.preventDefault();
        }}
      >
        Settings
      </Link>
      <h1 className="font-display text-3xl">Your reading context</h1>
      <p>
        Personal context is encrypted in storage. Folio&apos;s server decrypts
        it for your signed-in account; this is not end-to-end encryption. It is
        not public or sent to AI in this version.
      </p>
      <p>
        Context stays separate from book notes, public shops and reading
        history. Optional AI use is coming later.
      </p>
      <Link
        className="underline"
        href="/settings/context/diary"
        onClick={(e) => {
          if (
            dirty &&
            !window.confirm("Leave without saving your context changes?")
          )
            e.preventDefault();
        }}
      >
        Open private context diary
      </Link>
      {loading ? (
        <p role="status">Loading private context...</p>
      ) : (
        <>
          <fieldset disabled={busy || !available} className="space-y-5 min-w-0">
            <label className="block">
              Life right now
              <textarea
                aria-label="Life right now"
                className="block w-full border rounded p-2"
                rows={5}
                maxLength={5000}
                placeholder="Anything you want to keep in mind about your reading. You do not need to be specific."
                value={draft.lifeContext}
                onChange={(e) =>
                  setDraft({ ...draft, lifeContext: e.target.value })
                }
                onBlur={() => void save()}
              />
            </label>
            <fieldset>
              <legend>When do you usually read?</legend>
              <div className="flex flex-wrap gap-3">
                {READING_TIMES.map((time) => (
                  <label key={time}>
                    <input
                      type="checkbox"
                      checked={draft.readingTimes.includes(time)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          readingTimes: READING_TIMES.filter((t) =>
                            t === time
                              ? e.target.checked
                              : draft.readingTimes.includes(t),
                          ),
                        })
                      }
                    />{" "}
                    {time}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              Time available
              <select
                aria-label="Time available"
                className="block w-full border rounded p-2"
                value={draft.timeAvailable}
                onChange={(e) =>
                  update({
                    ...draft,
                    timeAvailable: e.target
                      .value as ContextProfile["timeAvailable"],
                  })
                }
              >
                {READING_BUDGETS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <p className="text-sm">
              Text saves when you leave the field; reading choices save when
              changed. Failed saves keep your draft in this page only.
            </p>
            <Button type="button" disabled={!dirty} onClick={() => void save()}>
              Save context now
            </Button>
          </fieldset>
          {hasData && available && <ContextDownload disabled={busy} />}
          {hasData && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Delete my context profile
            </Button>
          )}
        </>
      )}
      {dirty && <p>Unsaved context changes</p>}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          {available ? (
            <Link
              className="underline"
              href="/settings/context"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open saved context
            </Link>
          ) : (
            <button
              className="underline"
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry loading
            </button>
          )}
        </p>
      )}
      {confirm && (
        <section
          aria-label="Confirm context deletion"
          className="border rounded p-4 space-y-3"
        >
          <p>
            Delete all saved context, including every diary entry, and discard
            this draft? Your reading library, book notes and chat history will
            remain.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => void save(draft, true)}
          >
            Confirm delete context
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Keep my context
          </Button>
        </section>
      )}
    </main>
  );
}
