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
    include: { edition: { include: { work: true, translation: true } } },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const editions = await prisma.edition.findMany({
    where: { workId: book.edition.workId },
    include: {
      translation: true,
      userBooks: { where: { userId: session.user.id }, select: { id: true } },
    },
    orderBy: [{ year: "desc" }, { id: "asc" }],
  });
  return NextResponse.json({
    description: book.edition.work.description,
    genres: book.edition.work.genres,
    editions: editions.map((e) => ({
      id: e.id,
      current: e.id === book.editionId,
      userBookId: e.userBooks[0]?.id ?? null,
      publisher: e.publisher,
      year: e.year,
      format: e.format,
      language: e.translation?.language ?? null,
      pageCount: e.pageCount,
      isbn13: e.isbn13,
    })),
  });
}
