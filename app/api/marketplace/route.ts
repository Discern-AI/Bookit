import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { marketplaceListingSchema } from "@/lib/marketplace";
import { prisma } from "@/lib/prisma";

const saveSchema = z.object({
  listingId: z.string().uuid(),
  version: z.number().int().min(0),
  listing: marketplaceListingSchema,
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), listingId: z.string().uuid() }),
  z.object({ action: z.literal("unsave"), listingId: z.string().uuid() }),
  z.object({
    action: z.literal("delete"),
    listingId: z.string().uuid(),
    version: z.number().int().positive(),
  }),
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [listings, mine] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where: { isPublished: true, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
        saves: { where: { userId: session.user.id }, select: { userId: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.marketplaceListing.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
        saves: { where: { userId: session.user.id }, select: { userId: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
  ]);
  const byId = new Map([...listings, ...mine].map((item) => [item.id, item]));
  return NextResponse.json({
    listings: [...byId.values()].map(({ saves, userId, ...item }) => ({
      ...item,
      isSaved: saves.length > 0,
      isOwner: userId === session.user.id,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOriginJson(request))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid listing." },
      { status: 400 },
    );
  const { listingId, version, listing } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"marketplace:" + listingId}))`;
    const old = await tx.marketplaceListing.findUnique({
      where: { id: listingId },
    });
    if (old && old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 },
      );
    if (old?.deletedAt)
      return NextResponse.json(
        { error: "This listing was deleted." },
        { status: 409 },
      );
    if (!old && version !== 0)
      return NextResponse.json(
        { error: "Reload before saving." },
        { status: 409 },
      );
    const same =
      !!old &&
      old.kind === listing.kind &&
      old.category === listing.category &&
      old.title === listing.title &&
      old.description === listing.description &&
      old.makeDoAlternative === listing.makeDoAlternative &&
      old.budgetTier === listing.budgetTier &&
      old.pricePence === listing.pricePence &&
      old.externalUrl === listing.externalUrl &&
      old.workId === listing.workId &&
      old.isPublished === listing.isPublished;
    if (old && old.version !== version) {
      if (same && old.version === version + 1)
        return NextResponse.json({ listingId, version: old.version });
      return NextResponse.json(
        { error: "This listing changed elsewhere. Reload before saving." },
        { status: 409 },
      );
    }
    if (same) return NextResponse.json({ listingId, version: old!.version });
    if (listing.workId) {
      const ownedWork = await tx.work.findFirst({
        where: {
          id: listing.workId,
          editions: {
            some: { userBooks: { some: { userId: session.user.id } } },
          },
        },
        select: { id: true },
      });
      if (!ownedWork)
        return NextResponse.json(
          { error: "Choose a book from your library." },
          { status: 409 },
        );
    }
    const saved = old
      ? await tx.marketplaceListing.update({
          where: { id: listingId },
          data: { ...listing, version: { increment: 1 } },
        })
      : await tx.marketplaceListing.create({
          data: { id: listingId, userId: session.user.id, ...listing },
        });
    if (old?.workId !== saved.workId)
      await tx.marketplaceSave.updateMany({
        where: { listingId },
        data: { workId: saved.workId },
      });
    if (old?.isPublished && !saved.isPublished)
      await tx.marketplaceSave.deleteMany({
        where: { listingId, userId: { not: session.user.id } },
      });
    return NextResponse.json({ listingId, version: saved.version });
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOriginJson(request))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid marketplace action." },
      { status: 400 },
    );
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"marketplace:" + input.listingId}))`;
    const listing = await tx.marketplaceListing.findUnique({
      where: { id: input.listingId },
    });
    if (!listing)
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 },
      );
    if (listing.deletedAt) {
      if (input.action === "delete" && listing.userId === session.user.id)
        return NextResponse.json({ deleted: true });
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 },
      );
    }
    if (input.action === "save") {
      if (!listing.isPublished && listing.userId !== session.user.id)
        return NextResponse.json(
          { error: "Listing not found." },
          { status: 404 },
        );
      await tx.marketplaceSave.upsert({
        where: {
          userId_listingId: { userId: session.user.id, listingId: listing.id },
        },
        update: { workId: listing.workId },
        create: {
          userId: session.user.id,
          listingId: listing.id,
          workId: listing.workId,
        },
      });
      return NextResponse.json({ saved: true });
    }
    if (input.action === "unsave") {
      await tx.marketplaceSave.deleteMany({
        where: { userId: session.user.id, listingId: listing.id },
      });
      return NextResponse.json({ saved: false });
    }
    if (listing.userId !== session.user.id)
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 },
      );
    if (listing.version !== input.version)
      return NextResponse.json(
        { error: "Reload before deleting." },
        { status: 409 },
      );
    await tx.marketplaceSave.deleteMany({ where: { listingId: listing.id } });
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        workId: null,
        title: "",
        description: "",
        makeDoAlternative: "",
        externalUrl: "",
        pricePence: null,
        isPublished: false,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ deleted: true });
  });
}
