import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImportProvider } from "@/components/import/ImportProvider";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <ImportProvider>
      <AppShell user={session.user}>{children}</AppShell>
    </ImportProvider>
  );
}
