import { changeGiftClaim } from "@/lib/gift-claims";
type Context = { params: Promise<{ token: string; itemId: string }> };
export async function PUT(request: Request, props: Context) {
  const params = await props.params;
  return changeGiftClaim(
    request,
    params.itemId,
    { token: params.token },
    false,
  );
}
export async function DELETE(request: Request, props: Context) {
  const params = await props.params;
  return changeGiftClaim(request, params.itemId, { token: params.token }, true);
}
