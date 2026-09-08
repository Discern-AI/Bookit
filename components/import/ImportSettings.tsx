"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ImportReviews } from "./ImportReviews";
import { useImport } from "./ImportProvider";
export function ImportSettings() {
  const { job, setJob, error: progressError, retry } = useImport();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch("/api/import/goodreads", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "That import didn't start. Try again.");
      retry();
      setJob(data.job);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That import didn't start. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-paper-100 rounded-md p-6 shadow-card space-y-4">
      <h2 className="font-display text-2xl">Bring your books with you</h2>
      <p className="text-ink-500">
        Export your library from Goodreads, then choose the CSV here. Ratings,
        dates, reviews and custom shelves come with it. Books already in your
        library are skipped.
      </p>
      <form onSubmit={upload} className="space-y-4">
        <label className="block text-sm">
          Goodreads CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full mt-2 text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          type="submit"
          loading={busy}
          disabled={!file || (job !== null && job.status !== "complete")}
        >
          Import from Goodreads
        </Button>
      </form>
      {job && (
        <div className="space-y-2" role="status">
          <p className="text-sm">
            {job.status === "complete"
              ? job._count?.reviews
                ? "Import ready for review"
                : "Import complete"
              : "Importing your library"}{" "}
            &middot; {job.processed} of {job.total} books
          </p>
          <progress
            aria-label="Import progress"
            max={job.total}
            value={job.processed}
            className="w-full accent-shelf-700"
          />
          <p className="text-sm text-ink-500">
            {job.imported} added &middot; {job.skipped} already in your library
          </p>
          {!!job._count?.reviews && (
            <p className="text-sm text-ink-500">
              {job._count.reviews} books need an edition choice below.
            </p>
          )}
          {job.status !== "complete" && (
            <p className="text-sm text-ink-500">
              You can keep using Folio. If you close the app, the import resumes
              when you return.
            </p>
          )}
          {job.errors.length > 0 && (
            <details className="text-sm">
              <summary>{job.errors.length} rows need attention</summary>
              <ul>
                {job.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          <Link
            href="/library"
            className="text-sm text-shelf-700 hover:underline"
          >
            Open your library
          </Link>
        </div>
      )}
      {(error || progressError) && (
        <p role="alert" className="text-sm text-rose-600">
          {error || progressError}
        </p>
      )}
      {progressError && (
        <Button variant="secondary" onClick={retry}>
          Resume import
        </Button>
      )}
      <ImportReviews />
      <div className="pt-4 border-t border-ink-200">
        <h3 className="font-display text-lg mb-2">Keep a copy</h3>
        <a
          href="/api/library/export"
          className="text-shelf-700 hover:underline text-sm"
        >
          Export your library as JSON
        </a>
      </div>
    </section>
  );
}
