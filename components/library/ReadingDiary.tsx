"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SessionData,
  readingStats,
  estimateDays,
  localDate,
  shiftDay,
} from "@/lib/reading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
type DiarySession = SessionData & { title: string; userBookId: string };
type DiaryBook = {
  id: string;
  title: string;
  shelf: string;
  rating: number | null;
  pageCount: number | null;
  dateFinished: string | null;
};
export function ReadingDiary({
  sessions,
  books,
  goal,
  goalYear,
}: {
  sessions: DiarySession[];
  books: DiaryBook[];
  goal: number | null;
  goalYear: number | null;
}) {
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  useEffect(() => setToday(localDate()), []);
  const year = Number(today.slice(0, 4));
  const stats = readingStats(sessions, books, today);
  const [savedGoal, setSavedGoal] = useState(goal);
  const [savedYear, setSavedYear] = useState(goalYear);
  const [value, setValue] = useState(
    goalYear === year ? String(goal ?? "") : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings/reading-goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: value ? Number(value) : null, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedGoal(value ? Number(value) : null);
      setSavedYear(year);
      setMessage("Reading goal saved.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "That didn't save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const events = [
    ...sessions.map((s) => ({
      type: "session" as const,
      date: s.date,
      id: s.id,
      session: s,
    })),
    ...books
      .filter((b) => b.dateFinished)
      .map((b) => ({
        type: "finished" as const,
        date: b.dateFinished!,
        id: b.id,
        book: b,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  let previousMonth = "";
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
      <Link href="/library" className="text-sm text-shelf-700 hover:underline">
        Back to your library
      </Link>
      <h1 className="font-display text-4xl mt-4 mb-6">Reading diary</h1>
      <section className="bg-paper-100 rounded-md p-6 mb-6 shadow-card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            [stats.pages, `Pages in ${year}`],
            [stats.books, "Books finished"],
            [stats.streak, "Current streak (days)"],
            [stats.averageSession, "Average session (pages)"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="font-display text-3xl">{value}</p>
              <p className="text-sm text-ink-500">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-500 mt-4">
          {stats.pagesThisWeek} pages over the last seven days.
        </p>
        {savedGoal && savedYear === year && (
          <div className="mt-4">
            <div
              role="progressbar"
              aria-label="Yearly reading goal"
              aria-valuenow={stats.books}
              aria-valuemin={0}
              aria-valuemax={savedGoal}
              className="h-1 bg-ink-200 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-shelf-700 rounded-full"
                style={{
                  width: `${Math.min(100, (stats.books / savedGoal) * 100)}%`,
                }}
              />
            </div>
            <progress
              aria-label="Yearly reading goal"
              value={Math.min(stats.books, savedGoal)}
              max={savedGoal}
              className="w-full accent-shelf-700"
            />
            <p className="text-sm text-ink-500">
              {stats.books} of {savedGoal} books this year
            </p>
          </div>
        )}
        <details className="mt-4">
          <summary className="text-sm text-shelf-700 cursor-pointer">
            Set a reading goal
          </summary>
          <form
            className="flex flex-wrap gap-3 items-end mt-3"
            onSubmit={saveGoal}
          >
            <label className="text-sm">
              Books in {year}
              <Input
                type="number"
                min={1}
                max={10000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-28"
              />
            </label>
            <Button size="sm" type="submit" loading={busy}>
              Save goal
            </Button>
            <p className="text-xs text-ink-500">
              Leave blank to remove your goal.
            </p>
          </form>
          {message && (
            <p role="status" className="text-sm mt-2">
              {message}
            </p>
          )}
        </details>
      </section>
      {books
        .filter((b) => b.shelf === "reading_now")
        .map((book) => {
          const history = sessions.filter((s) => s.userBookId === book.id);
          const page = history[0]?.pageEnd ?? 0;
          const days = estimateDays(history, page, book.pageCount, today);
          return (
            <div key={book.id} className="border-b border-ink-200 py-4">
              <h2 className="font-display text-xl">{book.title}</h2>
              <p className="text-sm text-ink-500">
                Page {page}
                {book.pageCount ? ` of ${book.pageCount}` : ""}
                {days
                  ? `. At your recent pace, around ${shiftDay(today, days)}.`
                  : ". A completion estimate appears after a few reading days."}
              </p>
            </div>
          );
        })}
      <section className="mt-8" aria-label="Reading timeline">
        {!events.length ? (
          <EmptyState
            heading="A place for your reading days"
            body="Log a session from your library or chat. Your pages and thoughts will gather here."
          />
        ) : (
          events.map((event) => {
            const month = event.date.slice(0, 7);
            const showMonth = month !== previousMonth;
            previousMonth = month;
            return (
              <div key={`${event.type}-${event.id}`}>
                {showMonth && (
                  <h2 className="text-sm font-medium text-ink-500 mt-8 mb-3">
                    {new Date(`${month}-01T12:00:00Z`).toLocaleDateString(
                      "en-GB",
                      { month: "long", year: "numeric", timeZone: "UTC" },
                    )}
                  </h2>
                )}
                {event.type === "finished" ? (
                  <div className="bg-sage-100 rounded-md p-3 mb-3">
                    <h3 className="font-display text-lg">
                      Finished: {event.book.title}
                    </h3>
                    <p className="text-sm text-ink-500">
                      {event.date.slice(0, 10)}
                      {event.book.rating
                        ? ` / Rated ${event.book.rating} out of 5`
                        : ""}
                    </p>
                  </div>
                ) : (
                  <article className="flex gap-4 py-3 border-b border-ink-200">
                    <time className="text-xs text-ink-500 w-20 shrink-0">
                      {event.date.slice(0, 10)}
                    </time>
                    <div>
                      <h3 className="text-sm font-medium">
                        {event.session.title}
                      </h3>
                      <p className="text-sm text-ink-500">
                        {event.session.pageEnd - event.session.pageStart} pages
                        (p.{event.session.pageStart} &rarr; p.
                        {event.session.pageEnd})
                      </p>
                      {event.session.timeStart && event.session.timeEnd && (
                        <p className="text-xs text-ink-500">
                          {Math.round(
                            (Date.parse(event.session.timeEnd) -
                              Date.parse(event.session.timeStart)) /
                              60000,
                          )}{" "}
                          min
                        </p>
                      )}
                      {event.session.note && (
                        <p className="text-sm italic mt-1 whitespace-pre-wrap">
                          {event.session.note}
                        </p>
                      )}
                    </div>
                  </article>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
