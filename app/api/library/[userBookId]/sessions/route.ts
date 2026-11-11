import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function GET(
  request: Request,
  props: { params: Promise<{ userBookId: string }> },
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const book = await prisma.userBook.findFirst({
    where: { id: params.userBookId, userId: session.user.id },
    select: { id: true },
  });
  if (!book)
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && (cursor.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(cursor)))
    return NextResponse.json({ error: "Invalid session cursor." }, { status: 400 });
  const pageSize = 25;
  const sessions = await prisma.readingSession.findMany({
    where: { userBookId: book.id, deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      version: true,
      date: true,
      pageStart: true,
      pageEnd: true,
      timeStart: true,
      timeEnd: true,
      note: true,
    },
  });
  const hasMore = sessions.length > pageSize;
  if (hasMore) sessions.pop();
  return NextResponse.json({
    sessions,
    totalCount: await prisma.readingSession.count({
      where: { userBookId: book.id, deletedAt: null },
    }),
    nextCursor: hasMore ? sessions.at(-1)?.id : null,
  });
}
