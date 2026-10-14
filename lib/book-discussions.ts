import { discussionCommunity } from "./discussion-communities";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
export const discussionPostSchema = z
  .object({
    action: z.literal("post"),
    id: z.string().uuid(),
    communityId: z
      .string()
      .refine((id) => !!discussionCommunity(id), "Unknown community")
      .nullable()
      .default(null),
    workId: z.string().min(1).max(100),
    parentId: z.string().uuid().nullable(),
    title: z.string().trim().max(160),
    body: z.string().trim().min(1).max(5000),
    alias: z.string().trim().min(1).max(60),
    spoilers: z.boolean(),
    version: z.number().int().min(0),
  })
  .refine((d) => (d.parentId ? d.title === "" : d.title.length > 0), {
    message: "Threads need a title; replies do not.",
  });
export const discussionActionSchema = z.union([
  discussionPostSchema,
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("report"),
    id: z.string().uuid(),
    postId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export const discussionModerationSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(0),
  decision: z.enum(["remove", "dismiss"]),
});
export function ownDiscussionWhere(
  userId: string,
  workId?: string,
): Prisma.BookDiscussionWhereInput {
  return {
    userId,
    deletedAt: null,
    ...(workId ? { workId } : {}),
    OR: [{ parentId: null }, { parent: { deletedAt: null } }],
  };
}
export const discussionSelect = {
  id: true,
  workId: true,
  communityId: true,
  parentId: true,
  title: true,
  body: true,
  alias: true,
  spoilers: true,
  version: true,
  createdAt: true,
} as const;
