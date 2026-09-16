"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ArticleNode, articleFingerprint } from "@/lib/articles";
import {
  parseArticleRecovery,
  ArticleRecoveryCopy,
} from "@/lib/article-recovery";
export function ArticleRecovery({
  userId,
  articleKey,
  version,
  title,
  excerpt,
  content,
  dirty,
  onRestore,
}: {
  userId: string;
  articleKey: string;
  version: number;
  title: string;
  excerpt: string;
  content: ArticleNode;
  dirty: boolean;
  onRestore: (copy: ArticleRecoveryCopy) => void;
}) {
  const key = `folio:article-recovery:${userId}:${articleKey}`;
  const preference = `folio:article-recovery-enabled:${userId}`;
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [copy, setCopy] = useState<ArticleRecoveryCopy | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try {
      const prefix = `folio:article-recovery:${userId}:`;
      for (const storedKey of Object.keys(localStorage)) {
        if (storedKey.startsWith(prefix)) {
          try {
            parseArticleRecovery(localStorage.getItem(storedKey)!);
          } catch {
            localStorage.removeItem(storedKey);
          }
        }
      }
      const optIn = localStorage.getItem(preference) === "yes";
      setEnabled(optIn);
      const raw = optIn ? localStorage.getItem(key) : null;
      if (raw) {
        try {
          const saved = parseArticleRecovery(raw);
          if (
            articleFingerprint([saved.title, saved.excerpt, saved.content]) !==
            articleFingerprint([title, excerpt, content])
          )
            setCopy(saved);
          else localStorage.removeItem(key);
        } catch {
          localStorage.removeItem(key);
          setStatus("An expired or invalid recovery copy was removed.");
        }
      }
    } catch {
      setStatus("Browser storage is unavailable. Save your draft to keep it.");
    }
    setReady(true);
    // Read the recovery copy once on entry; later edits must not replace a pending offer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preference]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === preference && event.newValue !== "yes") {
        setEnabled(false);
        setCopy(null);
        setStatus("");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [preference]);
  useEffect(() => {
    if (!ready || !enabled || copy) return;
    try {
      if (localStorage.getItem(preference) !== "yes") {
        setEnabled(false);
        return;
      }
      if (dirty) {
        const saved = {
          version,
          title,
          excerpt,
          content,
          updatedAt: Date.now(),
        };
        const value = JSON.stringify(saved);
        parseArticleRecovery(value);
        localStorage.setItem(key, value);
        setStatus("Recovery copy saved on this browser.");
      } else {
        localStorage.removeItem(key);
        setStatus("");
      }
    } catch {
      setStatus("Could not keep a recovery copy. Save your draft to keep it.");
    }
  }, [
    ready,
    enabled,
    copy,
    key,
    preference,
    version,
    title,
    excerpt,
    content,
    dirty,
  ]);
  function discard() {
    try {
      localStorage.removeItem(key);
      setCopy(null);
    } catch {
      setStatus("Could not remove the recovery copy from browser storage.");
    }
  }
  function toggle(next: boolean) {
    try {
      localStorage.setItem(preference, next ? "yes" : "no");
      if (!next) {
        for (const storedKey of Object.keys(localStorage)) {
          if (storedKey.startsWith(`folio:article-recovery:${userId}:`))
            localStorage.removeItem(storedKey);
        }
        setCopy(null);
      }
      setEnabled(next);
      if (!next) setStatus("");
    } catch {
      setStatus("Browser storage is unavailable.");
    }
  }
  function download() {
    if (!copy) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "folio-article-recovery.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      aria-label="Draft recovery"
      className="border border-ink-200 rounded p-4 space-y-3"
    >
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!ready}
          onChange={(e) => toggle(e.target.checked)}
        />
        Keep a recovery copy on this browser
      </label>
      <p className="text-sm text-ink-500">
        Optional, unencrypted copies expire after seven days. Use on a device
        you trust. This does not publish or save your draft to your account.
      </p>
      {copy && (
        <div className="space-y-3">
          <p>
            Unsaved recovery copy found: {copy.title || "Untitled article"}.
          </p>
          {copy.version !== version && (
            <p>
              A newer saved version exists. Download the recovery copy to
              compare it; it cannot overwrite your current draft automatically.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={copy.version !== version}
              onClick={() => {
                onRestore(copy);
                setCopy(null);
              }}
            >
              Restore recovery copy
            </Button>
            <Button variant="secondary" onClick={download}>
              Download recovery copy
            </Button>
            <Button variant="secondary" onClick={discard}>
              Discard recovery copy
            </Button>
          </div>
        </div>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
