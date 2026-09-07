import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchBooks } from "@/lib/openLibrary";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchBooks(q);
  return NextResponse.json({ results });
}
