"use client";
import { useEffect, useState } from "react";
import { VideoCaptions, type CaptionData } from "./VideoCaptions";
import { VideoPostingFiles } from "./VideoPostingFiles";
import { VideoRecorder } from "./VideoRecorder";
import { Button } from "@/components/ui/Button";
export function VideoClip({ projectId }: { projectId: string }) {
  const [clip, setClip] = useState<({ id: string } & CaptionData) | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [confirm, setConfirm] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const url = `/api/video-projects/${projectId}/clip`;
  useEffect(() => {
    let active = true;
    fetch(url + "?metadata")
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load the clip. Reload to try again.");
        return r.json();
      })
      .then((d) => {
        if (active) {
          setClip(d.clip);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function change(remove: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(remove ? url + `?id=${clip?.id}` : url, {
        method: remove ? "DELETE" : "POST",
        body: remove ? undefined : file,
        headers: remove ? {} : { "Content-Type": "application/octet-stream" },
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save clip.");
      setClip(remove ? null : d.clip);
      setFile(null);
      setRecorded(false);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save clip.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Private video clip"
      className="border rounded p-4 space-y-3"
    >
      <h2 className="font-display text-2xl">Private video clip</h2>
      <p>
        One MP4 or WebM up to 25 MB. Uploads stay private and follow this plan
        into its linked book journals. Playback depends on your browser and the
        video codec.
      </p>
      {busy && <p role="status">Loading...</p>}
      {clip ? (
        <>
          <video
            key={clip.id}
            aria-label="Private video playback"
            className="w-full"
            controls
            preload="metadata"
            src={`${url}?id=${clip.id}`}
            onError={() =>
              setError(
                "This video cannot play in your browser. You can download it or upload another encoding.",
              )
            }
          >
            {clip.captions && (
              <track
                key={clip.captionVersion}
                kind="captions"
                label="Captions"
                default
                src={`${url}?id=${clip.id}&captions&v=${clip.captionVersion}`}
              />
            )}
          </video>
          <VideoPostingFiles projectId={projectId} clipId={clip.id} />
          <VideoCaptions
            key={clip.id}
            url={url}
            id={clip.id}
            initial={clip}
            disabled={busy}
            onSaved={(data) => setClip({ ...clip, ...data })}
          />
          <a
            className="underline"
            href={`${url}?id=${clip.id}`}
            download="folio-video"
          >
            Download video
          </a>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Remove clip
          </Button>
        </>
      ) : (
        ready && (
          <>
            <VideoRecorder
              disabled={busy}
              onActive={setRecording}
              onFile={(value) => {
                setFile(value);
                setRecorded(!!value);
              }}
            />
            <input
              aria-label="Choose private video"
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm"
              disabled={busy || recording || recorded}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError("");
              }}
            />
            <Button
              type="button"
              disabled={
                busy || recording || !file || file.size > 25 * 1024 * 1024
              }
              onClick={() => void change(false)}
            >
              Upload private clip
            </Button>
            {file && file.size > 25 * 1024 * 1024 && (
              <p role="alert">Choose a video up to 25 MB.</p>
            )}
          </>
        )
      )}
      {confirm && (
        <div>
          <p>
            Permanently remove this uploaded clip and its captions? Your script
            and book links remain.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void change(true)}
          >
            Confirm remove clip
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Keep clip
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
