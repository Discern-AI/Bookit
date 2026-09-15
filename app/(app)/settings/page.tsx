import { AccountSecurity } from "@/components/community/AccountSecurity";
import Link from "next/link";
import { auth } from "@/auth";
import { ImportSettings } from "@/components/import/ImportSettings";
export default async function SettingsPage() {
  const session = await auth();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <h1 className="font-display text-4xl">Settings</h1>
      <section>
        <h2 className="font-display text-2xl mb-2">Your account</h2>
        <p>{session?.user.name}</p>
        <p className="text-ink-500">{session?.user.email}</p>
      </section>
      <Link className="text-shelf-700 underline" href="/settings/profile">
        Manage public profile
      </Link>
      <Link className="block text-shelf-700 underline" href="/settings/shelves">
        Manage shelf sharing
      </Link>
      <AccountSecurity />
      <ImportSettings />
    </div>
  );
}
