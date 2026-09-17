import { AccountLinkRequest } from "@/components/community/AccountLinkRequest";
import { prisma } from "@/lib/prisma";
import { AccountSettings } from "@/components/community/AccountSettings";
import { AccountSecurity } from "@/components/community/AccountSecurity";
import Link from "next/link";
import { auth } from "@/auth";
import { ImportSettings } from "@/components/import/ImportSettings";
export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { name: true, email: true },
  });
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <h1 className="font-display text-4xl">Settings</h1>
      <section>
        <h2 className="font-display text-2xl mb-2">Your account</h2>
        <p>{user.name}</p>
        <p className="text-ink-500">{user.email}</p>
      </section>
      <Link className="text-shelf-700 underline" href="/settings/profile">
        Manage public profile
      </Link>
      <Link className="block text-shelf-700 underline" href="/settings/shelves">
        Manage shelf sharing
      </Link>
      <AccountSettings
        userId={session!.user.id}
        initialName={user.name || ""}
      />
      <AccountLinkRequest action="email" />
      <AccountSecurity />
      <ImportSettings />
    </div>
  );
}
