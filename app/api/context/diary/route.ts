import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  contextKey,
  encryptContext,
  decryptContext,
} from "@/lib/context-encryption";
import { diaryAction, diaryBinding, diaryText } from "@/lib/context-diary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Sign in first." }, 401);
  const page = Number(new URL(request.url).searchParams.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    return reply({ error: "Invalid page." }, 400);
  try {
    const [context, rows] = await prisma.$transaction(
      [
        prisma.readingContext.findUnique({
          where: { userId: session.user.id },
          select: { version: true },
        }),
        prisma.contextDiaryEntry.findMany({
          where: { userId: session.user.id, encryptedData: { not: null } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 20,
          take: 21,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    let key: Buffer | null = null;
    try {
      key = contextKey();
    } catch {}
    const entries = rows.slice(0, 20).map((row) => {
      let text: string | null = null;
      try {
        if (key)
          text = diaryText.parse(
            decryptContext(
              row.encryptedData!,
              diaryBinding(session.user.id, row.id),
              key,
            ),
          );
      } catch {}
      return {
        id: row.id,
        version: row.version,
        createdAt: row.createdAt,
        text,
      };
    });
    return reply({
      contextVersion: context?.version || 0,
      entries,
      hasNext: rows.length > 20,
      available: !!key,
    });
  } catch {
    return reply({ error: "Could not load your diary. Try again." }, 503);
  }
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 70000) {
        await reader.cancel();
        return reply({ error: "Entry is too large." }, 413);
      }
      chunks.push(part.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply({ error: "Invalid entry." }, 400);
  }
  const parsed = diaryAction.safeParse(body);
  if (!parsed.success)
    return reply({ error: "Write an entry of 1 to 10,000 characters." }, 400);
  const d = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
      const context = await tx.readingContext.findUnique({
        where: { userId: session.user.id },
        select: { version: true },
      });
      const old = await tx.contextDiaryEntry.findUnique({
        where: { id: d.id },
      });
      if (old && old.userId !== session.user.id)
        return reply({ error: "Entry not found." }, 404);
      const current = context?.version || 0;
      if (d.action === "delete" && old && !old.encryptedData)
        return reply({ ok: true, contextVersion: current });
      const stale = () =>
        reply(
          {
            error:
              "Your context or diary changed elsewhere. Your draft is kept; open the saved diary in another tab to compare.",
          },
          409,
        );
      if (d.action === "save" && old && !old.encryptedData) return stale();
      const key = d.action === "save" ? contextKey() : null;
      const previous =
        d.action === "save" && old?.encryptedData
          ? diaryText.parse(
              decryptContext(
                old.encryptedData,
                diaryBinding(session.user.id, d.id),
                key!,
              ),
            )
          : null;
      const same = d.action === "save" && previous === d.text;
      if (current !== d.contextVersion || (old?.version || 0) !== d.version) {
        if (
          same &&
          old?.version === d.version + 1 &&
          current === d.contextVersion + 1
        )
          return reply({
            contextVersion: current,
            entry: {
              id: old.id,
              version: old.version,
              createdAt: old.createdAt,
              text: previous,
            },
          });
        return stale();
      }
      if (d.action === "delete" && !old)
        return reply({ error: "Entry not found." }, 404);
      if (same)
        return reply({
          contextVersion: current,
          entry: {
            id: old!.id,
            version: old!.version,
            createdAt: old!.createdAt,
            text: previous,
          },
        });
      if (
        !old &&
        (await tx.contextDiaryEntry.count({
          where: { userId: session.user.id, encryptedData: { not: null } },
        })) >= 500
      )
        return reply(
          {
            error:
              "Your diary has 500 entries. Export and remove an entry before adding another.",
          },
          409,
        );
      const encryptedData =
        d.action === "save"
          ? encryptContext(d.text, diaryBinding(session.user.id, d.id), key!)
          : null;
      const entry = old
        ? await tx.contextDiaryEntry.update({
            where: { id: d.id },
            data: { encryptedData, version: { increment: 1 } },
          })
        : await tx.contextDiaryEntry.create({
            data: { id: d.id, userId: session.user.id, encryptedData },
          });
      const updated = context
        ? await tx.readingContext.update({
            where: { userId: session.user.id },
            data: { version: { increment: 1 } },
          })
        : await tx.readingContext.create({ data: { userId: session.user.id } });
      return reply({
        contextVersion: updated.version,
        entry:
          d.action === "save"
            ? {
                id: entry.id,
                version: entry.version,
                createdAt: entry.createdAt,
                text: d.text,
              }
            : null,
      });
    });
  } catch {
    return reply(
      {
        error:
          "Could not save the encrypted entry. Your draft is kept; check the server key and try again.",
      },
      503,
    );
  }
}
