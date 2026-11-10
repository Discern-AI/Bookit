import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { lookupByIsbn } from "@/lib/openLibrary";
export async function GET(
  _request: Request,
  props: { params: Promise<{ isbn: string }> },
) {
  const params = await props.params;
  if (!(await auth())?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const book = await lookupByIsbn(params.isbn);
    return NextResponse.json({ book }, { status: book ? 200 : 404 });
  } catch {
    return NextResponse.json(
      { error: "Book lookup is unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
