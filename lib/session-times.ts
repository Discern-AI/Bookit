export function localSessionTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid session time.");
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, -1);
}
export function sessionTimeValue(
  value: string,
  original: string | null,
): string | null {
  if (!value) return null;
  if (value === localSessionTime(original)) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))
    throw new Error("Choose a valid local session time.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid local session time.");
  const normalized =
    value.length === 16
      ? `${value}:00.000`
      : value.length === 19
        ? `${value}.000`
        : value.padEnd(23, "0");
  if (localSessionTime(date.toISOString()) !== normalized)
    throw new Error("This local time does not exist. Choose another time.");
  return date.toISOString();
}
