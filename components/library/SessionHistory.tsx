"use client";
import { useEffect, useState } from "react";
import type { SessionData } from "@/lib/reading";
export function SessionHistory({
  bookId,
  latestId,
}: {
  bookId: string;
  latestId: string | null;
}) {
  const [sessions, setSessions] = useState<SessionData[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setSessions(null);
    fetch(`/api/library/${bookId}/sessions`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setSessions(data.sessions);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [bookId, latestId, attempt]);
  return (
    <section className="space-y-3">
      <h3 className="font-display text-xl">Reading sessions</h3>
      {error ? (
        <button
          className="text-sm text-shelf-700"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Sessions could not load. Try again.
        </button>
      ) : sessions === null ? (
        <p role="status" className="text-sm text-ink-500">
          Loading sessions...
        </p>
      ) : !sessions.length ? (
        <p className="text-sm text-ink-500">
          Your reading sessions and notes will live here.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="py-2">Date</th>
                  <th>Pages</th>
                  <th>Read</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-ink-200">
                    <td className="py-2">{s.date.slice(0, 10)}</td>
                    <td>
                      {s.pageStart} &ndash; {s.pageEnd}
                    </td>
                    <td>{s.pageEnd - s.pageStart}</td>
                    <td>
                      {s.timeStart && s.timeEnd
                        ? `${Math.round((Date.parse(s.timeEnd) - Date.parse(s.timeStart)) / 60000)} min`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500">
            {sessions.length} sessions &middot;{" "}
            {sessions.reduce((n, s) => n + s.pageEnd - s.pageStart, 0)} pages
          </p>
          {sessions
            .filter((s) => s.note)
            .map((s) => (
              <blockquote key={s.id} className="border-l-2 border-ink-200 pl-3">
                <p className="text-xs text-ink-500">{s.date.slice(0, 10)}</p>
                <p className="text-sm italic whitespace-pre-wrap">{s.note}</p>
              </blockquote>
            ))}
        </>
      )}
    </section>
  );
}
