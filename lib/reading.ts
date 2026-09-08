export interface SessionData {
  id: string;
  date: string;
  pageStart: number;
  pageEnd: number;
  note: string | null;
  timeStart: string | null;
  timeEnd: string | null;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
export function readingStats(
  sessions: SessionData[],
  finished: { dateFinished: string | null }[],
  today: string,
) {
  const year = today.slice(0, 4);
  const inYear = sessions.filter(
    (s) => s.date.startsWith(year) && s.date.slice(0, 10) <= today,
  );
  const pages = inYear.reduce((n, s) => n + s.pageEnd - s.pageStart, 0);
  const days = new Set(
    sessions
      .filter((s) => s.pageEnd > s.pageStart)
      .map((s) => s.date.slice(0, 10)),
  );
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  const recent = sessions.filter(
    (s) =>
      s.date.slice(0, 10) >= shiftDay(today, -6) &&
      s.date.slice(0, 10) <= today,
  );
  return {
    pages,
    books: finished.filter(
      (b) =>
        b.dateFinished?.startsWith(year) &&
        b.dateFinished.slice(0, 10) <= today,
    ).length,
    streak,
    averageSession: inYear.length ? Math.round(pages / inYear.length) : 0,
    pagesThisWeek: recent.reduce((n, s) => n + s.pageEnd - s.pageStart, 0),
  };
}
export function estimateDays(
  sessions: SessionData[],
  currentPage: number,
  pageCount: number | null,
  today: string,
): number | null {
  if (!pageCount || currentPage >= pageCount) return null;
  const recent = sessions.filter(
    (s) =>
      s.date.slice(0, 10) >= shiftDay(today, -29) &&
      s.date.slice(0, 10) <= today,
  );
  const days = new Set(recent.map((s) => s.date.slice(0, 10)));
  if (days.size < 2) return null;
  const first = [...days].sort()[0];
  const elapsed = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(first)) / 86400000) + 1,
  );
  const pace =
    recent.reduce((n, s) => n + s.pageEnd - s.pageStart, 0) / elapsed;
  return pace > 0 ? Math.ceil((pageCount - currentPage) / pace) : null;
}
export interface ReadingIntent {
  pageStart?: number;
  pageEnd?: number;
  pages?: number;
  finished: boolean;
  yesterday: boolean;
}
export function parseReadingIntent(text: string): ReadingIntent | null {
  // Recognise only explicit logs. Questions about what to read are ordinary chat.
  if (
    !/\b(log(?:ged)?\b|(?:i\s+)?read\s+(?:another\s+)?\d|read\s+(?:from|to)\s+page|stopped\s+(?:at|on)\s+(?:page\s*)?\d|finished\s+(?:chapter|reading|my book))/i.test(
      text,
    )
  )
    return null;
  const range = text.match(
    /(?:from\s+)?page\s+(\d+)\s+(?:to|through|-)\s*(?:page\s*)?(\d+)/i,
  );
  const end = text.match(
    /(?:to\s+page|stopped\s+(?:at|on)\s+(?:page\s*)?)\s*(\d+)/i,
  );
  const count = text.match(
    /\b(?:log(?:ged)?|read)\s+(?:another\s+)?(\d+)\s+pages?\b/i,
  );
  return {
    ...(range
      ? { pageStart: Number(range[1]), pageEnd: Number(range[2]) }
      : {
          ...(end ? { pageEnd: Number(end[1]) } : {}),
          ...(count ? { pages: Number(count[1]) } : {}),
        }),
    finished: /\bfinished\s+(?:reading|my book|the book)\b/i.test(text),
    yesterday: /\byesterday\b/i.test(text),
  };
}
