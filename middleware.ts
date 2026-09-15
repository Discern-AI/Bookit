import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/signup");

  const isPublicBook =
    /^\/(?:book|path|profile|review|shelf|article)\/[^/]+\/?$/.test(
      req.nextUrl.pathname,
    );
  const isBlogFeed = /^\/blog\/[^/]+\/rss\/?$/.test(req.nextUrl.pathname);
  const isSharedGift = /^\/gift\/[a-f0-9]{64}\/?$/.test(req.nextUrl.pathname);
  if (
    !isLoggedIn &&
    !isAuthRoute &&
    !isPublicBook &&
    !isBlogFeed &&
    !isSharedGift
  ) {
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
  // Revocation is checked by Node auth. Never bounce an expired JWT away
  // from login based solely on the Edge-readable cookie.
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
