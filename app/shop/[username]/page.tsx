import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Curated books | Folio",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: { username: string };
}) {
  const shop = await prisma.curatorShop.findFirst({
    where: {
      isPublic: true,
      user: { username: params.username, profilePublic: true },
    },
    select: {
      title: true,
      introduction: true,
      user: { select: { username: true, publicName: true } },
      entries: {
        orderBy: { position: "asc" },
        select: {
          workId: true,
          note: true,
          retailerUrl: true,
          affiliate: true,
          work: { select: { title: true, authorName: true } },
        },
      },
    },
  });
  if (!shop) notFound();
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <Link className="underline" href={`/profile/${shop.user.username}`}>
        {shop.user.publicName}
      </Link>
      <h1 className="font-display text-3xl break-words">{shop.title}</h1>
      <p className="whitespace-pre-wrap break-words">{shop.introduction}</p>
      <p>
        Curated book recommendations. Purchases take place on external retailer
        sites; Folio does not confirm prices or availability.
      </p>
      <ol className="space-y-4">
        {shop.entries.map((e) => (
          <li key={e.workId} className="border rounded p-4 space-y-2">
            <Link
              className="underline font-display text-xl"
              href={`/book/${e.workId}`}
            >
              {e.work.title}
            </Link>
            <p>{e.work.authorName}</p>
            <p className="whitespace-pre-wrap break-words">{e.note}</p>
            {e.retailerUrl && (
              <>
                <a
                  className="underline"
                  href={e.retailerUrl}
                  target="_blank"
                  rel={
                    e.affiliate
                      ? "sponsored noopener noreferrer"
                      : "noopener noreferrer"
                  }
                >
                  Visit retailer for {e.work.title}
                </a>
                {e.affiliate && (
                  <p className="text-sm">
                    Affiliate link: this curator may earn a commission.
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
