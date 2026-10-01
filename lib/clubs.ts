import { z } from "zod";
import { validDate } from "./reading";
export const clubFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000),
  isPublic: z.boolean(),
};
export const aliasSchema = z.string().trim().min(1).max(60);
export const createClubSchema = z
  .object({
    ...clubFields,
    id: z.string().uuid(),
    alias: aliasSchema,
    isPair: z.boolean().default(false),
  })
  .strict()
  .refine((d) => !d.isPair || !d.isPublic, {
    message: "Reading Together is always private.",
  });
const version = z.number().int().min(0);
const id = z.string().uuid();
const date = z.string().refine(validDate).nullable();
export const scheduleSchema = z
  .object({
    action: z.literal("reading"),
    id,
    version,
    workId: z.string().min(1),
    startsOn: date,
    endsOn: date,
  })
  .strict()
  .refine((d) => !d.startsOn || !d.endsOn || d.startsOn <= d.endsOn, {
    message: "The end date must be on or after the start date.",
  });
export const clubActionSchema = z.union([
  z
    .object({
      action: z.literal("join"),
      version,
      membershipVersion: version.nullable(),
      alias: aliasSchema,
      invite: z.string().max(100).optional(),
    })
    .strict(),
  z.object({ action: z.literal("leave"), version: version }).strict(),
  z.object({ action: z.literal("update"), version, ...clubFields }).strict(),
  z
    .object({ action: z.enum(["invite", "revokeInvite", "delete"]), version })
    .strict(),
  z
    .object({ action: z.literal("removeMember"), userId: z.string(), version })
    .strict(),
  scheduleSchema,
  z.object({ action: z.literal("removeReading"), id, version }).strict(),
  z
    .object({
      action: z.literal("post"),
      id,
      readingId: id,
      body: z.string().trim().min(1).max(5000),
      spoilerPage: z.number().int().min(1).max(100000).nullable(),
      version,
    })
    .strict(),
  z.object({ action: z.literal("deletePost"), id, version }).strict(),
]);
export function clubPage(value: string | null) {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0;
}
export type ClubSummary = {
  isPair: boolean;
  partnerReserved: boolean;
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  version: number;
  owner: boolean;
  membership: {
    active: boolean;
    blocked: boolean;
    version: number;
    alias: string;
  } | null;
  memberCount: number;
};
export type ClubReading = {
  id: string;
  workId: string;
  startsOn: string | null;
  endsOn: string | null;
  version: number;
  work: { id: string; title: string; authorName: string };
};
export type ClubPost = {
  id: string;
  body: string;
  authorAlias: string;
  spoilerPage: number | null;
  version: number;
  createdAt: string;
  own: boolean;
};
export type ClubData = {
  club: ClubSummary;
  readings: ClubReading[];
  moreReadings: boolean;
  selected: ClubReading | null;
  posts: ClubPost[];
  morePosts: boolean;
  members: { userId: string; alias: string; version: number; self: boolean }[];
  moreMembers: boolean;
};
