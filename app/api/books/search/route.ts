import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchBooks } from "@/lib/openLibrary";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (q.length > 300)
    return NextResponse.json(
      { error: "Try a shorter search." },
      { status: 400 },
    );
  try {
    const results = await searchBooks(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Book search is unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
