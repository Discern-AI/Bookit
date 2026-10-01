import type { BookClub, BookClubMember } from "@prisma/client";
import { createHash } from "node:crypto";
export function inviteHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}
export function clubSummary(
  club: BookClub,
  member: BookClubMember | null | undefined,
  userId: string,
  memberCount: number,
) {
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    isPublic: club.isPublic,
    version: club.version,
    owner: club.ownerId === userId,
    membership: member
      ? {
          active: member.active,
          blocked: member.blocked,
          version: member.version,
          alias: member.alias,
        }
      : null,
    memberCount,
  };
}
export function clubReply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
