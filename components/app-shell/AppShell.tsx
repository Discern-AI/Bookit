"use client";

// App shell — Implementation Brief §3.1/§3.2.

import Link from "next/link";
import { SVGProps } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ChatIcon,
  LibraryIcon,
  BrowseIcon,
  CommunityIcon,
  SettingsIcon,
} from "@/components/icons";

type IconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/browse", label: "Browse", icon: BrowseIcon },
  { href: "/community", label: "Community", icon: CommunityIcon },
] as const;

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function NavLink({
  href,
  label,
  Icon,
  onClick,
}: {
  href: string;
  label: string;
  Icon: IconComponent;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "flex items-center gap-3 px-4 py-2.5 text-sm font-body rounded mx-2 transition-fast",
        active
          ? "bg-shelf-100 text-shelf-700 font-medium"
          : "text-ink-800 hover:bg-paper-200 hover:text-ink-950",
      ].join(" ")}
    >
      <Icon className="flex-shrink-0" />
      {label}
    </Link>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col bg-paper-100 border-r border-ink-200">
        <div className="px-5 pt-5 pb-4">
          <span className="font-display text-lg text-ink-950">Folio</span>
        </div>
        <nav className="flex-1 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
            />
          ))}
          <div className="my-2 mx-4 border-t border-ink-200" />
          <NavLink href="/settings" label="Settings" Icon={SettingsIcon} />
        </nav>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-4 py-4 text-left hover:bg-paper-200 transition-fast"
        >
          <span className="h-8 w-8 rounded-full bg-shelf-100 text-shelf-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
            {initials(user.name)}
          </span>
          <span className="text-sm text-ink-800 truncate">
            {user.name ?? user.email}
          </span>
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden h-12 bg-paper-50 border-b border-ink-200 flex items-center justify-center relative flex-shrink-0">
        <span className="font-display text-lg text-ink-950">Folio</span>
        <Link
          href="/settings"
          className="absolute left-3 text-sm text-shelf-700"
        >
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="absolute right-3 h-8 w-8 rounded-full bg-shelf-100 text-shelf-700 flex items-center justify-center text-xs font-medium"
        >
          {initials(user.name)}
        </button>
      </header>

      <main className="flex-1 min-w-0 overflow-y-auto bg-paper-50">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden h-16 bg-paper-50 border-t border-ink-200 flex-shrink-0 flex items-stretch">
        {NAV_ITEMS.map((item) => (
          <MobileNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
          />
        ))}
      </nav>
    </div>
  );
}

function MobileNavLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: IconComponent;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={[
        "flex-1 flex flex-col items-center justify-center gap-1 text-xs",
        active ? "text-shelf-700" : "text-ink-500",
      ].join(" ")}
    >
      <Icon className="flex-shrink-0" />
      {label}
    </Link>
  );
}
