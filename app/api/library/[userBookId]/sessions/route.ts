import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function GET(
  _request: Request,
  { params }: { params: { userBookId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const book = await prisma.userBook.findFirst({
    where: { id: params.userBookId, userId: session.user.id },
    select: { id: true },
  });
  if (!book)
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  return NextResponse.json({
    sessions: await prisma.readingSession.findMany({
      where: { userBookId: book.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        pageStart: true,
        pageEnd: true,
        timeStart: true,
        timeEnd: true,
        note: true,
      },
    }),
  });
}
