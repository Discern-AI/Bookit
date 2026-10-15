// A bounded, plain-text subset of WebVTT. Styling, markup and cue settings
// are deliberately excluded so imported caption files cannot add active content.
export function normalizeCaptions(input: string): string {
  if (input.length > 100000)
    throw Error("Captions must be at most 100,000 characters.");
  const text = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return "";
  const blocks = text.split(/\n[ \t]*\n/);
  if (blocks.shift() !== "WEBVTT" || !blocks.length || blocks.length > 1000)
    throw Error(
      "Start with WEBVTT, then a blank line and up to 1,000 timed cues.",
    );
  let previous = -1;
  function time(value: string) {
    const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
    if (!match) throw Error("Use timestamps such as 00:00:01.000.");
    const milliseconds =
      ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 +
        Number(match[3])) *
        1000 +
      Number(match[4]);
    if (!Number.isSafeInteger(milliseconds)) throw Error("Invalid timestamp.");
    return milliseconds;
  }
  for (const block of blocks) {
    const lines = block.split("\n");
    if (!lines[0].includes("-->")) {
      if (!/^[\w -]{1,80}$/.test(lines.shift() || ""))
        throw Error("Use simple cue identifiers.");
    }
    const timing = /^(\S+) --> (\S+)$/.exec(lines.shift() || "");
    if (!timing) throw Error("Each cue needs a start --> end timestamp line.");
    const start = time(timing[1]),
      end = time(timing[2]);
    if (end <= start || start < previous)
      throw Error(
        "Cues must have increasing start times and end after they start.",
      );
    previous = start;
    if (
      !lines.length ||
      !lines.join("").trim() ||
      /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(lines.join("\n"))
    )
      throw Error("Use plain caption text without markup.");
  }
  return text + "\n";
}
