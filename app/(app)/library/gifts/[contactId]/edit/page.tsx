import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { giftInclude, serializeGift } from "@/lib/gift-data";
import { GiftEditor } from "@/components/gifts/GiftEditor";
export default async function EditGiftPage({
  params,
}: {
  params: { contactId: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const contact = await prisma.giftContact.findFirst({
    where: { id: params.contactId, userId: session.user.id },
    include: giftInclude,
  });
  if (!contact) notFound();
  return <GiftEditor initial={serializeGift(contact)} />;
}
