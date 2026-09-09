import { changeGiftClaim } from "@/lib/gift-claims";
export async function DELETE(
  request: Request,
  { params }: { params: { contactId: string; itemId: string } },
) {
  return changeGiftClaim(
    request,
    params.itemId,
    { contactId: params.contactId },
    true,
  );
}
