import { changeGiftClaim } from "@/lib/gift-claims";
export async function DELETE(
  request: Request,
  props: { params: Promise<{ contactId: string; itemId: string }> },
) {
  const params = await props.params;
  return changeGiftClaim(
    request,
    params.itemId,
    { contactId: params.contactId },
    true,
  );
}
