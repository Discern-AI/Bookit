import type { Prisma } from "@prisma/client";
export const pathCardSelect = {
  id: true,
  title: true,
  description: true,
  isPublic: true,
  user: { select: { name: true } },
  _count: { select: { entries: true } },
} satisfies Prisma.ReadingPathSelect;
export interface PathCardData {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  user: { name: string | null };
  _count: { entries: number };
}
export interface PathBook {
  id: string;
  title: string;
  authorName: string;
}
export interface PathDraft {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  version: number;
  entries: { workId: string; note: string; work: PathBook }[];
}
