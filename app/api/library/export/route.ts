import {
  videoProjectInclude,
  serializeVideoProject,
} from "@/lib/video-projects";
import { cardProjectInclude, serializeCardProject } from "@/lib/card-projects";
import { ownDiscussionWhere, discussionSelect } from "@/lib/book-discussions";
import { readingChallenges } from "@/lib/challenge-progress";
import { ownClubPostsWhere } from "@/lib/club-journal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const discussionPosts = await prisma.bookDiscussion.findMany({
    where: ownDiscussionWhere(session.user.id),
    select: discussionSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const cardProjects = (
    await prisma.cardProject.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: cardProjectInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  ).map(serializeCardProject);
  const videoProjects = (
    await prisma.videoProject.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: videoProjectInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  ).map(serializeVideoProject);
  const challenges = await readingChallenges(session.user.id);
  const books = await prisma.userBook.findMany({
    where: { userId: session.user.id },
    include: {
      edition: { include: { work: true } },
      customShelves: { select: { name: true } },
      readingCycles: { orderBy: { number: "asc" } },
      readingSessions: { where: { deletedAt: null } },
    },
  });
  const journalEntries = await prisma.bookEntry.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const clubPosts = await prisma.bookClubPost.findMany({
    where: ownClubPostsWhere(session.user.id),
    select: {
      id: true,
      body: true,
      authorAlias: true,
      spoilerPage: true,
      createdAt: true,
      updatedAt: true,
      reading: {
        select: {
          id: true,
          workId: true,
          club: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        books,
        journalEntries,
        clubPosts,
        challenges,
        discussionPosts,
        cardProjects,
        videoProjects,
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="folio-library.json"',
        "Cache-Control": "no-store",
      },
    },
  );
}
