import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import { challengeSchema } from "@/lib/challenges";
import { readingChallenges } from "@/lib/challenge-progress";
import { z } from "zod";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  return reply({ challenges: await readingChallenges(session.user.id) });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = challengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return reply(
      {
        error:
          "Enter a title, target from 1 to 10,000 and valid dates in order.",
      },
      400,
    );
  const d = { ...input.data, genre: input.data.genre || null };
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const old = await tx.readingChallenge.findUnique({ where: { id: d.id } });
      if (old)
        return old.userId === session.user.id &&
          !old.deletedAt &&
          old.title === d.title &&
          old.target === d.target &&
          old.startsOn === d.startsOn &&
          old.endsOn === d.endsOn &&
          old.genre === d.genre
          ? reply({ ok: true })
          : reply(
              {
                error:
                  "This request has already changed. Reload before creating another challenge.",
              },
              409,
            );
      await tx.readingChallenge.create({
        data: { ...d, userId: session.user.id },
      });
      return reply({ ok: true }, 201);
    });
  } catch {
    return reply(
      { error: "Could not save. Your draft is kept; try again." },
      503,
    );
  }
}
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = z
    .object({ id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "Invalid challenge." }, 400);
  const result = await prisma.readingChallenge.updateMany({
    where: { id: input.data.id, userId: session.user.id },
    data: { deletedAt: new Date() },
  });
  return result.count
    ? reply({ ok: true })
    : reply({ error: "Challenge not found." }, 404);
}
