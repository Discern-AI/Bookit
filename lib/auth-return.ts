export function giftReturnPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  return next && /^\/gift\/[a-f0-9]{64}$/.test(next) ? next : "/chat";
}
