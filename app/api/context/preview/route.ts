import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { contextSelectionSchema } from "@/lib/context-sharing";
import { sharedContext } from "@/lib/shared-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401, headers });
  if (!sameOriginJson(request))
    return Response.json(
      { error: "Invalid request." },
      { status: 403, headers },
    );
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2000) {
        await reader.cancel();
        return Response.json(
          { error: "Selection too large." },
          { status: 413, headers },
        );
      }
      chunks.push(part.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json(
      { error: "Invalid selection." },
      { status: 400, headers },
    );
  }
  const parsed = contextSelectionSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Select your profile or up to three diary entries." },
      { status: 400, headers },
    );
  try {
    return Response.json(
      { context: await sharedContext(session.user.id, parsed.data) },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Selected context changed or cannot be decrypted. Reload and review it again.",
      },
      { status: 409, headers },
    );
  }
}
