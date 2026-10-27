import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  contextKey,
  encryptContext,
  decryptContext,
} from "@/lib/context-encryption";
import {
  contextActionSchema,
  contextProfileSchema,
  emptyContext,
} from "@/lib/reading-context";
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
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Sign in first." }, 401);
  try {
    const record = await prisma.readingContext.findUnique({
      where: { userId: session.user.id },
    });
    const diaryCount = await prisma.contextDiaryEntry.count({
      where: { userId: session.user.id, encryptedData: { not: null } },
    });
    try {
      const key = contextKey();
      const profile = record?.encryptedData
        ? contextProfileSchema.parse(
            JSON.parse(
              decryptContext(record.encryptedData, session.user.id, key),
            ),
          )
        : emptyContext;
      return reply({
        version: record?.version || 0,
        hasData: !!record?.encryptedData || diaryCount > 0,
        available: true,
        profile,
      });
    } catch {
      return reply({
        version: record?.version || 0,
        hasData: !!record?.encryptedData || diaryCount > 0,
        available: false,
        profile: null,
        error:
          "Encrypted context is unavailable. Check the server encryption key. Saved content has not been changed.",
      });
    }
  } catch {
    return reply({ error: "Could not load your context. Try again." }, 503);
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
    if (!reader) return reply({ error: "Invalid context." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 50000) {
        await reader.cancel();
        return reply({ error: "Context is too large." }, 413);
      }
      chunks.push(part.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply({ error: "Invalid context." }, 400);
  }
  const parsed = contextActionSchema.safeParse(body);
  if (!parsed.success)
    return reply(
      { error: "Check your context length and reading preferences." },
      400,
    );
  const d = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
      const old = await tx.readingContext.findUnique({
        where: { userId: session.user.id },
      });
      const diaryCount = await tx.contextDiaryEntry.count({
        where: { userId: session.user.id, encryptedData: { not: null } },
      });
      if (d.action === "delete" && !old?.encryptedData && !diaryCount)
        return reply({
          version: old?.version || 0,
          profile: emptyContext,
          hasData: false,
        });
      const key = d.action === "save" ? contextKey() : null;
      const existing =
        old?.encryptedData && d.action === "save"
          ? contextProfileSchema.parse(
              JSON.parse(
                decryptContext(old.encryptedData, session.user.id, key!),
              ),
            )
          : null;
      const same =
        d.action === "save" &&
        existing &&
        JSON.stringify(existing) === JSON.stringify(d.profile);
      if ((old?.version || 0) !== d.version) {
        if (same && old!.version === d.version + 1)
          return reply({
            version: old!.version,
            profile: existing,
            hasData: true,
          });
        return reply(
          {
            error:
              "Your context changed or was deleted elsewhere. Your draft is kept; open the saved profile in another tab to compare.",
          },
          409,
        );
      }
      if (same)
        return reply({
          version: old!.version,
          profile: existing,
          hasData: true,
        });
      if (d.action === "delete")
        await tx.contextDiaryEntry.updateMany({
          where: { userId: session.user.id, encryptedData: { not: null } },
          data: { encryptedData: null, version: { increment: 1 } },
        });
      const encryptedData =
        d.action === "save"
          ? encryptContext(JSON.stringify(d.profile), session.user.id, key!)
          : null;
      const saved = old
        ? await tx.readingContext.update({
            where: { userId: session.user.id },
            data: { encryptedData, version: { increment: 1 } },
          })
        : await tx.readingContext.create({
            data: { userId: session.user.id, encryptedData },
          });
      return reply({
        version: saved.version,
        profile: d.action === "save" ? d.profile : emptyContext,
        hasData: !!encryptedData || (d.action === "save" && diaryCount > 0),
      });
    });
  } catch {
    return reply(
      {
        error:
          "Could not save encrypted context. Your draft is kept; check the server key and try again.",
      },
      503,
    );
  }
}
