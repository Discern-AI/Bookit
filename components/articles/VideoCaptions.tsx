"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
export type CaptionData = { captions: string; captionVersion: number };
export function VideoCaptions({
  url,
  id,
  initial,
  disabled,
  onSaved,
}: {
  url: string;
  id: string;
  initial: CaptionData;
  disabled: boolean;
  onSaved: (data: CaptionData) => void;
}) {
  const [draft, setDraft] = useState(initial.captions);
  const [saved, setSaved] = useState(initial.captions);
  const [version, setVersion] = useState(initial.captionVersion);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (draft === saved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, saved]);
  async function save() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, version, captions: draft }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not save captions.");
      setDraft(data.captions);
      setSaved(data.captions);
      setVersion(data.captionVersion);
      onSaved(data);
      setStatus(
        data.captions ? "Captions saved privately." : "Captions removed.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save captions.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Video captions" className="space-y-3">
      <h3 className="font-display text-xl">Captions</h3>
      <p>
        Add a WebVTT caption file or edit timed captions below. Use plain text,
        without styling. Captions stay private with this clip; they are not
        generated automatically.
      </p>
      <fieldset disabled={disabled || busy} className="space-y-3 min-w-0">
        <label className="block">
          Import captions (.vtt)
          <input
            className="block w-full"
            type="file"
            accept=".vtt,text/vtt"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              if (file.size > 400000) {
                setError("Choose a caption file up to 400 KB.");
                return;
              }
              try {
                const text = await file.text();
                if (text.length > 100000)
                  throw Error("Captions must be at most 100,000 characters.");
                setDraft(text);
                setStatus(
                  "Imported into your draft. Save to apply these captions.",
                );
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not read captions.",
                );
              }
            }}
          />
        </label>
        <label className="block">
          Timed captions
          <textarea
            aria-label="Timed captions"
            className="block w-full border rounded p-2 font-mono text-sm"
            rows={8}
            maxLength={100000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nYour spoken words here."
            }
          />
        </label>
        <p className="text-sm">
          Separate each timed caption with a blank line. Clear the text and save
          to remove captions. Unsaved changes are lost when you leave this page.
        </p>
        <Button
          type="button"
          disabled={draft === saved}
          onClick={() => void save()}
        >
          Save captions
        </Button>
      </fieldset>
      {draft !== saved && <p>Unsaved caption changes</p>}
      {saved && (
        <a
          className="underline"
          href={`${url}?id=${id}&captions&v=${version}`}
          download="folio-captions.vtt"
        >
          Download saved captions
        </a>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
