import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  EditionProviderError,
  sourceWork,
  remoteEdition,
  remoteEditions,
} from "@/lib/provider-editions";
const workSelect = {
  id: true,
  title: true,
  authorName: true,
  openLibraryId: true,
  editions: {
    select: { isbn13: true },
    orderBy: { createdAt: "asc" as const },
    take: 100,
  },
};
function failure(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof EditionProviderError
          ? e.message
          : "Edition metadata could not be saved. Please try again.",
    },
    { status: e instanceof EditionProviderError ? e.status : 502 },
  );
}
export async function GET(
  request: Request,
  { params }: { params: { workId: string } },
) {
  if (!(await auth())?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const offset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  if (!Number.isInteger(offset) || offset < 0 || offset >= 10000)
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  const work = await prisma.work.findUnique({
    where: { id: params.workId },
    select: workSelect,
  });
  if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const sourceWorkId = await sourceWork(work);
    return NextResponse.json({
      sourceWorkId,
      ...(await remoteEditions(sourceWorkId, offset)),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: { workId: string } },
) {
  if (!(await auth())?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({ sourceEditionId: z.string().regex(/^OL\d+M$/) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid edition." },
      { status: 400 },
    );
  const work = await prisma.work.findUnique({
    where: { id: params.workId },
    select: workSelect,
  });
  if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const sourceWorkId = await sourceWork(work);
    const edition = await remoteEdition(parsed.data.sourceEditionId);
    if (edition.workIds.length !== 1 || edition.workIds[0] !== sourceWorkId)
      throw new EditionProviderError(
        "That edition belongs to a different or ambiguous work. No changes were made.",
        409,
      );
    const saved = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${work.id}))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`edition:${edition.openLibraryId}`}))`;
      if (edition.isbn13)
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`isbn:${edition.isbn13}`}))`;
      const matches = await db.edition.findMany({
        take: 2,
        where: {
          OR: [
            { openLibraryId: edition.openLibraryId },
            ...(edition.isbns.length
              ? [{ isbn13: { in: edition.isbns } }]
              : []),
          ],
        },
      });
      if (matches.length > 1)
        throw new EditionProviderError(
          "The source identifiers point to different saved editions. No records were merged.",
          409,
        );
      const existing = matches[0];
      if (
        existing &&
        (existing.workId !== work.id ||
          (existing.openLibraryId &&
            existing.openLibraryId !== edition.openLibraryId))
      )
        throw new EditionProviderError(
          "This identifier is already attached to another catalogue edition. No records were merged.",
          409,
        );
      const metadata = {
        openLibraryId: edition.openLibraryId,
        languages: edition.languages,
        translators: edition.translators,
        metadataUpdatedAt: new Date(),
      };
      if (existing)
        return db.edition.update({
          where: { id: existing.id },
          data: {
            openLibraryId: existing.openLibraryId ?? metadata.openLibraryId,
            languages: existing.languages.length
              ? existing.languages
              : metadata.languages,
            translators: existing.translators.length
              ? existing.translators
              : metadata.translators,
            publisher: existing.publisher ?? edition.publisher,
            metadataUpdatedAt: metadata.metadataUpdatedAt,
          },
        });
      return db.edition.create({
        data: {
          workId: work.id,
          ...metadata,
          editionTitle: edition.title,
          publisher: edition.publisher,
          year: edition.year,
          isbn13: edition.isbn13,
          pageCount: edition.pageCount,
          coverUrl: edition.coverUrl,
          format: edition.format,
        },
      });
    });
    return NextResponse.json({
      book: {
        editionId: saved.id,
        workId: work.id,
        title: saved.editionTitle ?? work.title,
        author: work.authorName,
        format: saved.format,
        publisher: saved.publisher ?? undefined,
        year: saved.year ?? undefined,
        isbn13: saved.isbn13 ?? undefined,
        coverUrl: saved.coverUrl ?? undefined,
        pageCount: saved.pageCount ?? undefined,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
