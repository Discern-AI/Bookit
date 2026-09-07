export function normalizeIsbn(
  value: string | null | undefined,
): string | undefined {
  const isbn = (value ?? "").replace(/[^\dXx]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (n, c, i) => n + (c === "X" ? 10 : Number(c)) * (10 - i),
      0,
    );
    if (sum % 11 !== 0) return undefined;
    const base = `978${isbn.slice(0, 9)}`;
    const check =
      (10 -
        ([...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) %
          10)) %
      10;
    return base + check;
  }
  if (!/^97[89]\d{10}$/.test(isbn)) return undefined;
  return [...isbn].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) %
    10 ===
    0
    ? isbn
    : undefined;
}
