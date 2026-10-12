"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Bookmark, Calculator, LayoutDashboard, LogOut, Menu, Package, PackagePlus, Settings, ShieldCheck, Sparkles, Truck, X,
} from "lucide-react";
import { cn } from "@/lib/format";
import { apiCall } from "@/lib/client";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/loads", label: "Load board", icon: Package },
  { href: "/app/assistant", label: "AI dispatcher", icon: Sparkles },
  { href: "/app/fleet", label: "Fleet", icon: Truck, carrierOnly: true },
  { href: "/app/analytics", label: "Market", icon: BarChart3 },
  { href: "/app/saved", label: "Saved & alerts", icon: Bookmark },
  { href: "/app/post", label: "Post a load", icon: PackagePlus },
  { href: "/app/calculator", label: "Calculator", icon: Calculator },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const isActive = (path: string, href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));

export function Sidebar({ isAdmin, isBroker, orgName, plan }: { isAdmin: boolean; isBroker: boolean; orgName: string; plan: string }) {
  const path = usePathname();
  const base = isBroker ? NAV.filter((n) => !("carrierOnly" in n && n.carrierOnly)) : NAV;
  const items = isAdmin ? [...base, { href: "/app/admin", label: "Admin", icon: ShieldCheck }] : base;
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center px-5">
        <Link href="/app" aria-label="Dashboard">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        {items.map((n) => {
          const active = isActive(path, n.href, "exact" in n ? n.exact : false);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <n.icon className={cn("h-4 w-4", active ? "text-brand" : "text-subtle group-hover:text-muted")} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <div className="truncate text-sm font-medium">{orgName}</div>
          <div className="text-xs text-muted">{plan} plan</div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ userName, unread, search }: { userName: string; unread: number; search: React.ReactNode }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);

  async function logout() {
    await apiCall("/api/auth/logout").catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <Link href="/app" className="lg:hidden" aria-label="Dashboard">
          <Logo withText={false} />
        </Link>
        <div className="min-w-0 flex-1">{search}</div>
        <Link href="/app/notifications" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
        </Link>
        <ThemeToggle />
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand" aria-label="Account menu" aria-expanded={menu}>
            {userName.slice(0, 1).toUpperCase()}
          </button>
          {menu && (
            <div className="absolute right-0 top-11 w-52 animate-fade-up rounded-xl border border-border bg-surface p-1.5 shadow-pop">
              <div className="truncate px-2.5 py-2 text-sm font-medium">{userName}</div>
              <Link href="/app/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <Settings className="h-4 w-4" /> Settings
              </Link>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Dedicated mobile navigation: 4 primary destinations + a "More" sheet. */
export function MobileNav({ isAdmin, isBroker }: { isAdmin: boolean; isBroker: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const base = isBroker ? NAV.filter((n) => !("carrierOnly" in n && n.carrierOnly)) : NAV;
  const primary = base.slice(0, 4);
  const more = [...base.slice(4), ...(isAdmin ? [{ href: "/app/admin", label: "Admin", icon: ShieldCheck }] : [])];
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {primary.map((n) => {
            const active = isActive(path, n.href, "exact" in n ? n.exact : false);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-xs", active ? "text-brand" : "text-muted")}>
                <n.icon className="h-5 w-5" />
                {n.label.replace("Load board", "Loads").replace("AI dispatcher", "AI")}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted" aria-expanded={open}>
            <Menu className="h-5 w-5" /> More
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">More</span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((n) => (
                <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 px-2 py-3 text-xs">
                  <n.icon className="h-5 w-5 text-brand" />
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
