"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
type Profile = {
  username: string;
  publicName: string;
  bio: string;
  profilePublic: boolean;
  version: number;
};
type Review = {
  body: string;
  rating: number | null;
  isPublic: boolean;
  version: number;
};
export function PublishingForm({
  initial,
  workId,
  importedReview,
}: {
  initial: Profile | Review;
  workId?: string;
  importedReview?: string | null;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const router = useRouter();
  const field = "w-full rounded border border-ink-200 bg-paper-50 p-3";
  function copyImportedReview() {
    if (!importedReview || !("body" in draft)) return;
    setDraft({ ...draft, body: importedReview });
    setConfirmImport(false);
    setMessage(
      "Imported review copied into this unsaved community draft. Review it, then save when ready.",
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        workId ? `/api/reviews/${workId}` : "/api/profile",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save.");
      setDraft({ ...draft, version: result.version });
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        {"username" in draft ? (
          <>
            <label className="block">
              Username
              <input
                required
                className={field}
                value={draft.username}
                maxLength={30}
                onChange={(e) =>
                  setDraft({ ...draft, username: e.target.value })
                }
              />
            </label>
            <label className="block">
              Public display name
              <input
                required
                className={field}
                maxLength={80}
                value={draft.publicName}
                onChange={(e) =>
                  setDraft({ ...draft, publicName: e.target.value })
                }
              />
            </label>
            <label className="block">
              Bio
              <textarea
                className={field}
                maxLength={1000}
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              />
            </label>
            <label className="flex gap-2 items-start">
              <input
                type="checkbox"
                checked={draft.profilePublic}
                onChange={(e) =>
                  setDraft({ ...draft, profilePublic: e.target.checked })
                }
              />
              Publish my profile. My username, display name, bio, public follow
              counts, shared shelves, comments and published reviews will be
              visible to anyone.
            </label>
            <p className="text-sm text-ink-500">
              Turning this off also hides your shared shelves, published reviews
              and comments. Turning it on again makes them visible again.
              Unshared shelves, imported reviews and private notes stay private.
            </p>
          </>
        ) : (
          <>
            {importedReview && (
              <div className="rounded border border-ink-200 bg-paper-100 p-3 space-y-2">
                <p className="text-sm">
                  You have a private imported review for this book. Copying it
                  creates editable draft text here; it does not save or publish
                  anything, and your private imported review remains unchanged.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (draft.body.trim()) setConfirmImport(true);
                    else copyImportedReview();
                  }}
                >
                  Copy imported review into draft
                </Button>
              </div>
            )}
            <label className="block">
              Review
              <textarea
                required
                rows={8}
                className={field}
                maxLength={10000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <label className="block">
              Review rating
              <select
                className={field}
                value={draft.rating ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rating: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">No rating</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={draft.isPublic}
                onChange={(e) =>
                  setDraft({ ...draft, isPublic: e.target.checked })
                }
              />
              Publish this review and its rating to my profile, Community and
              the book page.
            </label>
            <p className="text-sm text-ink-500">
              Unchecked reviews are private drafts. This rating is separate from
              your private library rating.
            </p>
          </>
        )}
        <Button type="submit" loading={busy}>
          Save {workId ? "review" : "profile"}
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      <Modal
        open={confirmImport}
        title="Replace community draft text?"
        onClose={() => setConfirmImport(false)}
      >
        <p className="mb-4">
          This replaces the text currently in the form with your private
          imported review. It does not change the saved draft until you choose
          Save review.
        </p>
        <div className="flex gap-3">
          <Button type="button" onClick={copyImportedReview}>
            Replace draft text
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmImport(false)}
          >
            Keep current draft
          </Button>
        </div>
      </Modal>
    </form>
  );
}
