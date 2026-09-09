import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { giftSchema } from "@/lib/gifts";
import { giftInclude, serializeGift } from "@/lib/gift-data";
export async function mutateGift(
  request: Request,
  contactId?: string,
  remove = false,
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = giftSchema.safeParse(body);
  const id = contactId ?? z.string().uuid().safeParse(body?.id).data;
  const version = z.number().int().positive().safeParse(body?.version);
  if (!id || (contactId && !version.success) || (!remove && !parsed.success))
    return NextResponse.json(
      {
        error:
          "Check the name, dates, amounts and book ideas. Each book can appear once; amounts need at most two decimal places.",
      },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const existing = await db.giftContact.findUnique({
      where: { id },
      include: giftInclude,
    });
    if (contactId) {
      if (!existing || existing.userId !== session.user.id)
        return { error: "Not found", status: 404 };
      if (existing.version !== version.data)
        return {
          error:
            "This gift list changed in another tab. Your draft is still here. Open the saved list before editing again.",
          status: 409,
        };
      if (remove) {
        await db.giftContact.delete({ where: { id } });
        return { deleted: true };
      }
    }
    if (!parsed.success) return { error: "Invalid gift list", status: 400 };
    const { items, ...fields } = parsed.data;
    if (existing && !contactId) {
      const current = serializeGift(existing);
      const canonical = (list: typeof items) =>
        list
          .map(({ workId, status, priority, pricePence, note }) => ({
            workId,
            status,
            priority,
            pricePence,
            note,
          }))
          .sort((a, b) => a.workId.localeCompare(b.workId));
      const same =
        existing.userId === session.user.id &&
        current.name === fields.name &&
        current.tasteNotes === fields.tasteNotes &&
        current.budgetPence === fields.budgetPence &&
        JSON.stringify(current.occasions) ===
          JSON.stringify(fields.occasions) &&
        JSON.stringify(canonical(current.items)) ===
          JSON.stringify(canonical(items));
      return same
        ? { id, version: existing.version }
        : {
            error:
              "This gift list was already created. Open your gift lists before trying again.",
            status: 409,
          };
    }
    if (
      (await db.work.count({
        where: { id: { in: items.map((i) => i.workId) } },
      })) !== items.length
    )
      return {
        error: "A selected book is no longer in the catalogue.",
        status: 400,
      };
    if (contactId) await db.giftItem.deleteMany({ where: { contactId } });
    const data = { ...fields, giftItems: { create: items } };
    const saved = contactId
      ? await db.giftContact.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        })
      : await db.giftContact.create({
          data: { id, userId: session.user.id, ...data },
        });
    return { id: saved.id, version: saved.version };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
