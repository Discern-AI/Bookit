import { giftReturnPath } from "@/lib/auth-return";
import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/signup");

  const isPublicBook = /^\/(?:book|path)\/[^/]+\/?$/.test(req.nextUrl.pathname);
  const isSharedGift = /^\/gift\/[a-f0-9]{64}\/?$/.test(req.nextUrl.pathname);
  if (!isLoggedIn && !isAuthRoute && !isPublicBook && !isSharedGift) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isSharedGift) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(
      new URL(giftReturnPath(req.nextUrl.search), req.nextUrl.origin),
    );
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
