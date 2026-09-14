import { z } from "zod";
export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,29}$/),
  publicName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000),
  profilePublic: z.boolean(),
  version: z.number().int().min(0),
});
export const reviewSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  rating: z.number().int().min(1).max(5).nullable(),
  isPublic: z.boolean(),
  version: z.number().int().min(0),
});
export const publishedReviews = {
  isPublic: true,
  user: { profilePublic: true },
};
export const reviewSelect = {
  id: true,
  body: true,
  rating: true,
  updatedAt: true,
  user: { select: { username: true, publicName: true } },
  work: { select: { id: true, title: true, authorName: true } },
};
