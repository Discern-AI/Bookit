"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const LIMIT = 25 * 1024 * 1024;
export function VideoRecorder({
  disabled,
  onFile,
  onActive,
}: {
  disabled: boolean;
  onFile: (file: File | null) => void;
  onActive: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "recording" | "stopping" | "preview"
  >("idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [seconds, setSeconds] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const objectUrl = useRef("");
  function release() {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(
    () => () => {
      generation.current++;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (phase === "recording" && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {});
    }
  }, [phase]);
  useEffect(() => {
    if (phase === "idle") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);
  function cancel() {
    generation.current++;
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setPreview("");
    setPhase("idle");
    onActive(false);
    onFile(null);
  }
  function stop() {
    setPhase("stopping");
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
  }
  async function start() {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Recording is unavailable here. Use a supported browser over HTTPS, or upload a video file.",
      );
      return;
    }
    const mimeType = [
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setError(
        "This browser cannot record MP4 or WebM. Upload a video file instead.",
      );
      return;
    }
    const token = ++generation.current;
    setPhase("requesting");
    onActive(true);
    onFile(null);
    setSeconds(0);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      if (token !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        void video.current.play().catch(() => {});
      }
      const recording = new MediaRecorder(media, {
        mimeType,
        videoBitsPerSecond: 1500000,
        audioBitsPerSecond: 96000,
      });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0,
        failed = false;
      recording.ondataavailable = (e) => {
        if (token !== generation.current || failed) return;
        size += e.data.size;
        if (size > LIMIT) {
          failed = true;
          setError("Recording exceeded 25 MB. Try a shorter recording.");
          stop();
          return;
        }
        if (e.data.size) chunks.push(e.data);
      };
      recording.onerror = () => {
        failed = true;
        setError("Recording failed. Try again or upload a video file.");
        stop();
      };
      recording.onstop = () => {
        if (token !== generation.current) return;
        release();
        onActive(false);
        if (failed || !size) {
          setPhase("idle");
          if (!failed) setError("No video was recorded. Please try again.");
          return;
        }
        const type = recording.mimeType.startsWith("video/mp4")
          ? "video/mp4"
          : "video/webm";
        const file = new File(
          chunks,
          `folio-recording.${type === "video/mp4" ? "mp4" : "webm"}`,
          { type },
        );
        objectUrl.current = URL.createObjectURL(file);
        setPreview(objectUrl.current);
        setPhase("preview");
        onFile(file);
      };
      media.getTracks().forEach(
        (track) =>
          (track.onended = () => {
            if (recording.state === "recording") stop();
          }),
      );
      recording.start(250);
      setPhase("recording");
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 120) stop();
      }, 250);
    } catch {
      if (token !== generation.current) return;
      release();
      onActive(false);
      setPhase("idle");
      setError(
        "Camera or microphone could not be opened. Check browser permissions and devices, then try again or upload a file.",
      );
    }
  }
  return (
    <section aria-label="Record video" className="space-y-3">
      <p>
        Record with your camera and microphone for up to two minutes. Review
        locally, then choose Upload private clip to save it. Leaving this page
        loses an unsaved recording.
      </p>
      {phase === "idle" && (
        <Button type="button" disabled={disabled} onClick={() => void start()}>
          Start camera recording
        </Button>
      )}
      {(phase === "requesting" ||
        phase === "recording" ||
        phase === "stopping") && (
        <>
          <video
            ref={video}
            aria-label="Camera preview"
            className="w-full"
            muted
            autoPlay
            playsInline
          />
          <p role="status">
            {phase === "requesting"
              ? "Waiting for camera and microphone permission..."
              : phase === "stopping"
                ? "Preparing preview..."
                : `Recording: ${seconds}s / 120s`}
          </p>
          {phase === "recording" && (
            <Button type="button" onClick={stop}>
              Stop recording
            </Button>
          )}
        </>
      )}
      {preview && (
        <>
          <video
            aria-label="Recorded video preview"
            className="w-full"
            src={preview}
            controls
            playsInline
          />
          <a className="underline" href={preview} download="folio-recording">
            Download unsaved recording
          </a>
        </>
      )}
      {phase !== "idle" && (
        <Button
          type="button"
          disabled={disabled}
          variant="secondary"
          onClick={cancel}
        >
          {phase === "preview" ? "Discard recording" : "Cancel recording"}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
