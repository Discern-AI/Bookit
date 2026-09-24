import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseReadingIntent, validDate, shiftDay } from "@/lib/reading";
import { libraryInclude, serializeBook } from "@/lib/book-data";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = z
    .object({
      workId: z.string().optional(),
      message: z.string().max(12000),
      today: z.string().refine(validDate),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Check the message and date." },
      { status: 400 },
    );
  const intent = parseReadingIntent(input.data.message);
  if (!intent) return NextResponse.json({ handled: false });
  const books = await prisma.userBook.findMany({
    where: {
      userId: session.user.id,
      shelf: "reading_now",
      ...(input.data.workId ? { edition: { workId: input.data.workId } } : {}),
    },
    include: libraryInclude,
    orderBy: { dateAdded: "desc" },
  });
  if (!books.length)
    return NextResponse.json({
      handled: true,
      message:
        "Mark a book as reading now in your library, then tell me which pages you read.",
    });
  if (
    intent.pages === undefined &&
    intent.pageEnd === undefined &&
    !intent.finished
  )
    return NextResponse.json({
      handled: true,
      message:
        "Tell me the page you reached or how many pages you read. I won't guess page numbers from a chapter.",
    });
  const named = books.filter((b) =>
    input.data.message
      .toLowerCase()
      .includes(b.edition.work.title.toLowerCase()),
  );
  return NextResponse.json({
    handled: true,
    intent,
    date: intent.yesterday ? shiftDay(input.data.today, -1) : input.data.today,
    books: (named.length === 1 ? named : books).map(serializeBook),
  });
}
