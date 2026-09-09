import { changeGiftClaim } from "@/lib/gift-claims";
type Context = { params: { token: string; itemId: string } };
export async function PUT(request: Request, { params }: Context) {
  return changeGiftClaim(
    request,
    params.itemId,
    { token: params.token },
    false,
  );
}
export async function DELETE(request: Request, { params }: Context) {
  return changeGiftClaim(request, params.itemId, { token: params.token }, true);
}
