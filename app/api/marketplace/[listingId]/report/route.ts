import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { prisma } from "@/lib/prisma";

const reportSchema = z.object({
  reason: z.enum(["spam", "misleading", "unsafe", "harassment", "other"]),
  details: z.string().trim().min(5).max(2000),
});

export async function POST(
  request: Request,
  { params }: { params: { listingId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Invalid request." }, { status: 403 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose a reason and provide 5-2,000 characters." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.marketplaceListing.findUnique({
      where: { id: params.listingId },
    });
    if (
      !listing ||
      listing.deletedAt ||
      !listing.isPublished ||
      listing.moderationStatus !== "active" ||
      listing.userId === session.user.id
    )
      return { status: 404, error: "Listing not found." };
    await tx.marketplaceReport.upsert({
      where: {
        listingId_reporterId_listingVersion: {
          listingId: listing.id,
          reporterId: session.user.id,
          listingVersion: listing.version,
        },
      },
      update: {},
      create: {
        listingId: listing.id,
        reporterId: session.user.id,
        listingVersion: listing.version,
        title: listing.title,
        description: listing.description,
        makeDoAlternative: listing.makeDoAlternative,
        category: listing.category,
        budgetTier: listing.budgetTier,
        workId: listing.workId,
        reason: parsed.data.reason,
        details: parsed.data.details,
      },
    });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
