import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BookshopOutcomeManager } from "@/components/context/BookshopOutcomeManager";

export default async function BookshopsPage() {
  const session = await auth(); if (!session?.user) return null;
  const [works, outcomes] = await Promise.all([
    prisma.work.findMany({ where: { editions: { some: { userBooks: { some: { userId: session.user.id } } } } }, select: { id: true, title: true, authorName: true }, orderBy: [{ title: "asc" }, { id: "asc" }], take: 100 }),
    prisma.bookshopOutcome.findMany({ where: { userId: session.user.id, deletedAt: null }, include: { work: { select: { id: true, title: true, authorName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50 }),
  ]);
  return <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6"><nav className="flex gap-4"><Link className="text-shelf-700 underline" href="/library">Library</Link><Link className="text-shelf-700 underline" href="/library/reading-life">Reading Life</Link></nav><header><h1 className="font-display text-4xl">Bookshops</h1><p className="text-ink-500 mt-2">Find local shops and privately note the outcome without claiming stock or availability.</p></header><BookshopOutcomeManager works={works} initial={outcomes.map((item) => ({ ...item, work: item.work }))} /></main>;
}
