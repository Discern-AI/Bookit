export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
// Container signatures only; browser support still depends on the encoded codecs.
export function videoMime(data: Buffer): string | null {
  if (
    data.length >= 24 &&
    data.toString("ascii", 4, 8) === "ftyp" &&
    data.readUInt32BE(0) >= 16 &&
    data.readUInt32BE(0) <= data.length
  )
    return "video/mp4";
  if (
    data.length >= 16 &&
    data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
    data.subarray(4, 4096).includes(Buffer.from("webm"))
  )
    return "video/webm";
  return null;
}
export function videoRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null | false {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  )
    return false;
  return { start, end };
}
