import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { contextKey, decryptContext } from "@/lib/context-encryption";
import { contextProfileSchema, emptyContext } from "@/lib/reading-context";
import { diaryBinding, diaryText } from "@/lib/context-diary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401, headers });
  try {
    const key = contextKey();
    const [context, entries] = await prisma.$transaction(
      [
        prisma.readingContext.findUnique({
          where: { userId: session.user.id },
        }),
        prisma.contextDiaryEntry.findMany({
          where: { userId: session.user.id, encryptedData: { not: null } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 501,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    if (entries.length > 500) throw Error();
    const profile = context?.encryptedData
      ? contextProfileSchema.parse(
          JSON.parse(
            decryptContext(context.encryptedData, session.user.id, key),
          ),
        )
      : emptyContext;
    const diary = entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      text: diaryText.parse(
        decryptContext(
          e.encryptedData!,
          diaryBinding(session.user.id, e.id),
          key,
        ),
      ),
    }));
    return new Response(JSON.stringify({ profile, diary }, null, 2), {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="folio-private-context.json"',
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Could not decrypt the complete context export. No partial download was produced.",
      },
      { status: 503, headers },
    );
  }
}
