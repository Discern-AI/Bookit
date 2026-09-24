import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = params.get("conversation");
  if (id && !z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid conversation." }, { status: 400 });
  const listPage = Number(params.get("listPage") ?? 0);
  if (!Number.isInteger(listPage) || listPage < 0 || listPage > 100000)
    return Response.json({ error: "Invalid page." }, { status: 400 });
  const where = { userId: session.user.id, kind: "chat", deletedAt: null };
  const conversations = await prisma.bookEntry.groupBy({
    by: ["conversationId"],
    where,
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    skip: listPage * 50,
    take: 51,
  });
  const conversationId = id ?? conversations[0]?.conversationId ?? null;
  const before = params.get("before");
  const beforeId = params.get("beforeId");
  if (beforeId && !z.string().uuid().safeParse(beforeId).success)
    return Response.json({ error: "Invalid entry." }, { status: 400 });
  if (before && !z.string().datetime().safeParse(before).success)
    return Response.json({ error: "Invalid date." }, { status: 400 });
  const rows = conversationId
    ? await prisma.bookEntry.findMany({
        where: {
          ...where,
          conversationId,
          ...(before
            ? {
                OR: [
                  { createdAt: { lt: new Date(before) } },
                  ...(beforeId
                    ? [{ createdAt: new Date(before), id: { lt: beforeId } }]
                    : []),
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101,
      })
    : [];
  const messages = rows.slice(0, 100).reverse();
  return Response.json(
    {
      conversationId,
      conversations: conversations.slice(0, 50),
      moreConversations: conversations.length > 50,
      messages,
      hasMore: rows.length > 100,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
