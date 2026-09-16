export function recapPeriod(value: string | undefined, today: string) {
  const current = Number(today.slice(0, 4));
  const candidate = value && /^\d{4}$/.test(value) ? Number(value) : current;
  const year = candidate >= 1900 && candidate <= current ? candidate : current;
  return { year, through: year === current ? today : `${year}-12-31` };
}
export function recapCounts(
  sessions: { date: Date; pageStart: number; pageEnd: number }[],
) {
  return {
    pages: sessions.reduce(
      (sum, session) => sum + Math.max(0, session.pageEnd - session.pageStart),
      0,
    ),
    days: new Set(
      sessions
        .filter((session) => session.pageEnd > session.pageStart)
        .map((session) => session.date.toISOString().slice(0, 10)),
    ).size,
  };
}
