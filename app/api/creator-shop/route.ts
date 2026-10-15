import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import { shopSaveSchema, shopInclude, shopData } from "@/lib/curator-shop";
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = shopSaveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      {
        error:
          "Check your title, text lengths, unique book choices and HTTPS retailer links. Published shops need at least one book; affiliate links need a URL.",
      },
      400,
    );
  const { version, shop } = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { profilePublic: true, username: true },
      });
      if (!user) return reply({ error: "Sign in again." }, 401);
      const old = await tx.curatorShop.findUnique({
        where: { userId: session.user.id },
        include: shopInclude,
      });
      const same =
        old &&
        JSON.stringify(
          shopSaveSchema.parse({ version: old.version, shop: shopData(old) })
            .shop,
        ) === JSON.stringify(shop);
      if ((old?.version || 0) !== version) {
        if (same && old!.version === version + 1) return reply(shopData(old!));
        return reply(
          {
            error:
              "Your shop changed elsewhere. Your draft is kept; open the saved shop in another tab before saving.",
          },
          409,
        );
      }
      if (shop.isPublic && (!user.profilePublic || !user.username))
        return reply(
          {
            error:
              "Make your profile public and choose a username before publishing.",
          },
          400,
        );
      const retained = new Set(old?.entries.map((e) => e.workId) || []);
      for (const entry of shop.entries)
        if (
          !retained.has(entry.workId) &&
          !(await tx.userBook.findFirst({
            where: {
              userId: session.user.id,
              edition: { workId: entry.workId },
            },
            select: { id: true },
          }))
        )
          return reply(
            { error: "Choose new books from your own library." },
            400,
          );
      if (same) return reply(shopData(old!));
      const { entries, ...fields } = shop;
      if (old)
        await tx.curatorShopEntry.deleteMany({
          where: { userId: session.user.id },
        });
      const data = {
        ...fields,
        entries: { create: entries.map((e, position) => ({ ...e, position })) },
      };
      const saved = old
        ? await tx.curatorShop.update({
            where: { userId: session.user.id },
            data: { ...data, version: { increment: 1 } },
            include: shopInclude,
          })
        : await tx.curatorShop.create({
            data: { userId: session.user.id, ...data },
            include: shopInclude,
          });
      return reply(shopData(saved));
    });
  } catch {
    return reply(
      { error: "Could not save your shop. Your draft is kept; try again." },
      503,
    );
  }
}
