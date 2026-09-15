import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bookAttributes } from "@/lib/article-embeds";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 160);
  const page = Math.max(
    1,
    Math.min(10000, Number(url.searchParams.get("page")) || 1),
  );
  const rows = await prisma.userBook.findMany({
    where: {
      userId: session.user.id,
      ...(q
        ? {
            edition: {
              work: {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { authorName: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
    },
    select: {
      edition: {
        select: {
          id: true,
          coverUrl: true,
          work: { select: { id: true, title: true, authorName: true } },
        },
      },
    },
    orderBy: { id: "asc" },
    skip: (Math.floor(page) - 1) * 20,
    take: 21,
  });
  return Response.json(
    {
      books: rows.slice(0, 20).map((b) => bookAttributes(b.edition)),
      hasNext: rows.length > 20,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
