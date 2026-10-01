import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { inviteHash, clubReply, clubSummary } from "@/lib/club-server";
import { sameOriginJson } from "@/lib/book-journal";
export async function POST(request: Request) {
  const s = await auth();
  if (!s?.user.id) return clubReply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return clubReply({ error: "Use Folio on this site." }, 403);
  const p = z
    .object({ invite: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!p.success)
    return clubReply({ error: "Check the invitation code." }, 400);
  const c = await prisma.bookClub.findFirst({
    where: { inviteHash: inviteHash(p.data.invite), deletedAt: null },
    include: {
      members: { where: { userId: s.user.id } },
      _count: { select: { members: { where: { active: true } } } },
    },
  });
  if (
    !c ||
    c.members[0]?.blocked ||
    (c.isPair &&
      c.partnerId &&
      c.partnerId !== s.user.id &&
      c.ownerId !== s.user.id)
  )
    return clubReply({ error: "This invitation is unavailable." }, 404);
  return clubReply({
    club: clubSummary(c, c.members[0], s.user.id, c._count.members),
  });
}
