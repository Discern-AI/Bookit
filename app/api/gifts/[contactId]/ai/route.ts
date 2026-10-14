import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  giftAiRequestSchema,
  giftAiPrompt,
  giftAiSystem,
  parseGiftSuggestions,
} from "@/lib/gift-ai";
export const runtime = "nodejs";
export const maxDuration = 60;
const active = new Set<string>();
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = giftAiRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      {
        error:
          "Add reading preferences and check the budget before asking for ideas.",
      },
      400,
    );
  const d = parsed.data;
  const contact = await prisma.giftContact.findFirst({
    where: { id: params.contactId, userId: session.user.id },
    select: { version: true, giftItems: { select: { workId: true } } },
  });
  if (!contact) return reply({ error: "Gift list not found." }, 404);
  if (contact.version !== d.version)
    return reply(
      {
        error:
          "This gift list changed elsewhere. Your draft is kept; open the saved list before trying again.",
      },
      409,
    );
  if (!process.env.ANTHROPIC_API_KEY)
    return reply(
      {
        error:
          "AI gift suggestions are not connected yet. Your draft is safe; you can still add books from the catalogue.",
      },
      503,
    );
  if (active.has(session.user.id))
    return reply(
      {
        error:
          "A gift suggestion request is already running. Please wait before trying again.",
      },
      429,
    );
  active.add(session.user.id);
  try {
    const excluded = [
      ...new Set([
        ...d.excludeWorkIds,
        ...contact.giftItems.map((item) => item.workId),
      ]),
    ];
    const terms = d.tasteNotes.match(/[\p{L}\p{N}]{3,30}/gu)?.slice(0, 8) || [];
    const select = {
      id: true,
      title: true,
      authorName: true,
      genres: true,
      themes: true,
    } as const;
    const where = { id: { notIn: excluded } };
    let candidates = terms.length
      ? await prisma.work.findMany({
          where: {
            ...where,
            OR: terms.flatMap((term) => [
              { title: { contains: term, mode: "insensitive" as const } },
              { authorName: { contains: term, mode: "insensitive" as const } },
              {
                genres: {
                  hasSome: [
                    term,
                    term.toLowerCase(),
                    term[0].toUpperCase() + term.slice(1).toLowerCase(),
                  ],
                },
              },
              {
                themes: {
                  hasSome: [
                    term,
                    term.toLowerCase(),
                    term[0].toUpperCase() + term.slice(1).toLowerCase(),
                  ],
                },
              },
            ]),
          },
          select,
          orderBy: [{ title: "asc" }, { id: "asc" }],
          take: 40,
        })
      : [];
    if (!candidates.length)
      candidates = await prisma.work.findMany({
        where,
        select,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: 40,
      });
    if (!candidates.length) return reply({ suggestions: [] });
    const client = new Anthropic({ maxRetries: 0, timeout: 30000 });
    const result = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 1800,
        system: giftAiSystem,
        messages: [{ role: "user", content: giftAiPrompt(d, candidates) }],
      },
      { signal: request.signal },
    );
    if (result.stop_reason !== "end_turn")
      throw new Error("Incomplete suggestions");
    const suggestions = parseGiftSuggestions(
      result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      candidates,
      excluded,
    );
    const current = await prisma.giftContact.findFirst({
      where: { id: params.contactId, userId: session.user.id },
      select: { version: true },
    });
    if (!current) return reply({ error: "Gift list not found." }, 404);
    if (current.version !== d.version)
      return reply(
        {
          error:
            "The saved list changed while suggestions were being prepared. Your draft is kept; reopen the saved list.",
        },
        409,
      );
    return reply({ suggestions });
  } catch {
    return reply(
      {
        error:
          "Could not prepare gift suggestions. Your draft is safe. Try again.",
      },
      503,
    );
  } finally {
    active.delete(session.user.id);
  }
}
