export type ShareCardBook = {
  editionId: string;
  workId: string;
  title: string;
  authorName: string;
  coverUrl: string;
};
export type ReadingRecap = {
  year: number;
  through: string;
  books: number;
  pages: number;
  days: number;
};
export type ShareCardInput = {
  format: "square" | "portrait";
  theme: "paper" | "night";
  byline: string;
} & (
  | { kind: "shelfie"; books: ShareCardBook[]; heading: string }
  | { kind: "recap"; recap: ReadingRecap }
  | {
      kind: "book" | "quote";
      book: ShareCardBook;
      quote: string;
      caption: string;
      page: string;
    }
);
export function wrapCardText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (measure(line ? `${line} ${word}` : word) <= maxWidth) {
        line = line ? `${line} ${word}` : word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      for (const char of Array.from(word)) {
        if (line && measure(line + char) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
export function shareCardDescription(input: ShareCardInput) {
  if (input.kind === "shelfie")
    return [
      input.heading.trim() || "On my shelf",
      ...input.books.map((book) => `${book.title} / ${book.authorName}`),
      input.byline,
    ]
      .filter(Boolean)
      .join(" / ");
  if (input.kind === "recap")
    return `${input.recap.year} reading recap / ${input.recap.books} books finished / ${input.recap.pages} pages logged / ${input.recap.days} reading days / Through ${input.recap.through}${input.byline ? ` / ${input.byline}` : ""}`;
  return [
    input.kind === "quote" ? input.quote : input.caption,
    input.book.title,
    input.book.authorName,
    input.kind === "quote" ? input.page : "",
    input.byline,
  ]
    .filter(Boolean)
    .join(" / ");
}
export function drawShareCard(
  canvas: HTMLCanvasElement,
  input: ShareCardInput,
  style: {
    displayFont: string;
    bodyFont: string;
    background: string;
    ink: string;
    accent: string;
  },
) {
  canvas.width = 1080;
  canvas.height = input.format === "portrait" ? 1350 : 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot render this card.");
  const height = canvas.height;
  const width = 888;
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, 1080, height);
  ctx.fillStyle = style.accent;
  ctx.fillRect(48, 48, 8, height - 96);
  ctx.globalAlpha = 0.08;
  ctx.fillRect(72, 72, 936, height - 144);
  ctx.globalAlpha = 1;
  ctx.textBaseline = "top";
  function label(text: string, y: number, size = 24) {
    ctx!.font = `500 ${size}px ${style.bodyFont}`;
    ctx!.fillStyle = style.accent;
    ctx!.fillText(text, 96, y);
  }
  function block(
    text: string,
    y: number,
    area: number,
    maxSize: number,
    minSize: number,
    font: string,
    x = 96,
    textWidth = width,
  ) {
    for (let size = maxSize; size >= minSize; size -= 2) {
      ctx!.font = `400 ${size}px ${font}`;
      const lines = wrapCardText(
        text,
        textWidth,
        (t) => ctx!.measureText(t).width,
      );
      const step = size * 1.3;
      if (lines.length * step <= area) {
        ctx!.fillStyle = style.ink;
        lines.forEach((line, i) => ctx!.fillText(line, x, y + i * step));
        return lines.length * step;
      }
    }
    throw new Error(
      "The text is too long for this layout. Shorten it or choose Portrait.",
    );
  }
  label("FOLIO / READING NOTES", 100);
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(96, 154);
  ctx.lineTo(984, 154);
  ctx.stroke();
  if (input.kind === "shelfie") {
    if (!input.books.length || input.books.length > 6)
      throw new Error("Choose between one and six books.");
    block(
      input.heading.trim() || "On my shelf",
      205,
      90,
      48,
      24,
      style.displayFont,
    );
    const rowHeight = Math.min(150, (height - 480) / input.books.length);
    input.books.forEach((book, index) => {
      const y = 330 + index * rowHeight;
      const x = index % 2 ? 112 : 96;
      ctx.fillStyle = style.accent;
      ctx.globalAlpha = index % 2 ? 0.16 : 0.08;
      ctx.fillRect(x, y, 872, rowHeight - 10);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = style.accent;
      ctx.strokeRect(x, y, 872, rowHeight - 10);
      ctx.fillRect(x + 12, y + 10, 4, rowHeight - 30);
      const titleHeight = block(
        book.title,
        y + 12,
        rowHeight - 54,
        32,
        18,
        style.displayFont,
        x + 32,
        804,
      );
      block(
        book.authorName,
        y + 18 + titleHeight,
        28,
        20,
        16,
        style.bodyFont,
        x + 32,
        804,
      );
    });
  } else if (input.kind === "recap") {
    label("MY READING YEAR", 208, 22);
    block(String(input.recap.year), 260, 150, 112, 60, style.displayFont);
    const rows = [
      [input.recap.books, "BOOKS FINISHED"],
      [input.recap.pages, "PAGES LOGGED"],
      [input.recap.days, "READING DAYS"],
    ] as const;
    rows.forEach(([count, title], index) => {
      const y = 440 + index * (input.format === "portrait" ? 210 : 145);
      block(count.toLocaleString("en-GB"), y, 85, 64, 32, style.displayFont);
      label(title, y + 82, 20);
    });
    label(`Through ${input.recap.through}`, height - 155, 20);
  } else if (input.kind === "book") {
    label("ON MY BOOKSHELF", 208, 22);
    const titleHeight = block(
      input.book.title,
      270,
      height - 830,
      76,
      30,
      style.displayFont,
    );
    block(
      input.book.authorName,
      300 + titleHeight,
      130,
      32,
      20,
      style.bodyFont,
    );
    if (input.caption.trim())
      block(input.caption.trim(), height - 370, 170, 38, 24, style.displayFont);
  } else {
    if (!input.quote.trim())
      throw new Error("Enter a quote to preview your card.");
    block(
      `\u201c${input.quote.trim()}\u201d`,
      210,
      height - 620,
      58,
      28,
      style.displayFont,
    );
    const titleHeight = block(
      input.book.title,
      height - 365,
      88,
      30,
      20,
      style.displayFont,
    );
    block(
      input.book.authorName,
      height - 345 + titleHeight,
      65,
      24,
      18,
      style.bodyFont,
    );
    if (input.page.trim()) label(input.page.trim(), height - 175, 20);
  }
  ctx.strokeStyle = style.accent;
  ctx.beginPath();
  ctx.moveTo(96, height - 112);
  ctx.lineTo(984, height - 112);
  ctx.stroke();
  label(input.byline || "Made with Folio", height - 82, 20);
  return { width: 1080, height };
}
