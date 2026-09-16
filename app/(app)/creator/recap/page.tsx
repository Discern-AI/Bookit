import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShareCardStudio } from "@/components/articles/ShareCardStudio";
import { recapCounts, recapPeriod } from "@/lib/reading-recap";
export default async function Page({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await auth();
  const period = recapPeriod(
    searchParams.year,
    new Date().toISOString().slice(0, 10),
  );
  const range = {
    gte: new Date(`${period.year}-01-01T00:00:00.000Z`),
    lt: new Date(Date.parse(`${period.through}T00:00:00.000Z`) + 86400000),
  };
  const [books, sessions, user] = await Promise.all([
    prisma.userBook.count({
      where: { userId: session!.user.id, shelf: "read", dateFinished: range },
    }),
    prisma.readingSession.findMany({
      where: { userId: session!.user.id, date: range },
      select: { date: true, pageStart: true, pageEnd: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session!.user.id },
      select: { profilePublic: true, username: true },
    }),
  ]);
  const recap = { ...period, books, ...recapCounts(sessions) };
  return (
    <>
      <form
        action="/creator/recap"
        className="max-w-6xl mx-auto px-6 pt-6 flex flex-wrap gap-3 items-end"
      >
        <label>
          Reading year
          <input
            className="block border border-ink-200 rounded p-2"
            type="number"
            name="year"
            min="1900"
            max={new Date().getUTCFullYear()}
            defaultValue={period.year}
            key={period.year}
            required
          />
        </label>
        <button className="underline" type="submit">
          View year
        </button>
        <Link className="underline" href="/library/diary">
          Reading diary
        </Link>
      </form>
      <ShareCardStudio
        key={period.year}
        recap={recap}
        publicByline={
          user.profilePublic && user.username ? `@${user.username}` : ""
        }
      />
    </>
  );
}
