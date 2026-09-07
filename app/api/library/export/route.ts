import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const books = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: {
      edition: { include: { work: true } },
      customShelves: { select: { name: true } },
      readingSessions: true,
    },
  });
  return new Response(
    JSON.stringify({ exportedAt: new Date().toISOString(), books }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="folio-library.json"',
        "Cache-Control": "no-store",
      },
    },
  );
}
