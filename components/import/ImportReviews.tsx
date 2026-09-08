"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useImport } from "./ImportProvider";
type Review = {
  id: string;
  title: string;
  author: string;
  candidates: {
    id: string;
    publisher: string | null;
    year: number | null;
    format: string;
    isbn13: string | null;
  }[];
};
export function ImportReviews() {
  const { job, setJob } = useImport();
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/import/reviews");
      if (!response.ok) throw new Error();
      setReviews((await response.json()).reviews);
    } catch {
      setError("The import reviews couldn't load. Try again.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, job?.processed]);
  async function resolve(id: string, choice: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/import/reviews/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (job?.id === data.job.id) setJob(data.job);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!reviews.length && !error) return null;
  return (
    <section className="space-y-4 border-t border-ink-200 pt-4">
      <h3 className="font-display text-xl">Check your editions</h3>
      <p className="text-sm text-ink-500">
        These rows have no ISBN and match more than one edition. Choose a match,
        keep a separate record, or skip the row. Up to 50 are shown at a time.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Try again
          </button>
        </p>
      )}
      {reviews.map((review) => (
        <form
          key={review.id}
          className="p-4 border border-ink-200 rounded space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const choice = new FormData(e.currentTarget).get(
              "choice",
            ) as string;
            void resolve(review.id, choice);
          }}
        >
          <h4 className="font-display text-lg">{review.title}</h4>
          <p className="text-sm text-ink-500">{review.author}</p>
          <label className="block text-sm">
            Edition
            <select
              name="choice"
              required
              defaultValue=""
              className="block w-full border border-ink-200 rounded bg-paper-50 p-2"
            >
              <option value="" disabled>
                Choose a match
              </option>
              {review.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.publisher, c.year, c.format, c.isbn13]
                    .filter(Boolean)
                    .join(" / ") || "Edition without metadata"}
                </option>
              ))}
              <option value="separate">Keep a separate record</option>
              <option value="skip">Skip this row</option>
            </select>
          </label>
          <Button loading={busy} size="sm" type="submit">
            Confirm edition
          </Button>
        </form>
      ))}
    </section>
  );
}
