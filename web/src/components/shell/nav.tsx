"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Bookmark, Calculator, LayoutDashboard, LogOut, Menu, Package, PackagePlus, Settings, ShieldCheck, Sparkles, Truck, X,
} from "lucide-react";
import { cn } from "@/lib/format";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { LanguageSwitcher } from "../language-switcher";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";

const NAV = [
  { href: "/app", label: "dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/loads", label: "loadBoard", icon: Package },
  { href: "/app/assistant", label: "aiDispatcher", icon: Sparkles },
  { href: "/app/fleet", label: "fleet", icon: Truck, carrierOnly: true },
  { href: "/app/analytics", label: "market", icon: BarChart3 },
  { href: "/app/saved", label: "saved", icon: Bookmark },
  { href: "/app/post", label: "postLoad", icon: PackagePlus },
  { href: "/app/calculator", label: "calculator", icon: Calculator },
  { href: "/app/settings", label: "settings", icon: Settings },
] as const;
const ADMIN_ITEM = { href: "/app/admin", label: "admin", icon: ShieldCheck } as const;
type NavItem = (typeof NAV)[number] | typeof ADMIN_ITEM;
// Compact labels for the 4-slot mobile bar.
const SHORT: Partial<Record<NavItem["label"], "loadsShort" | "aiShort">> = { loadBoard: "loadsShort", aiDispatcher: "aiShort" };

const isActive = (path: string, href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));

export function Sidebar({ isAdmin, isBroker, orgName, plan }: { isAdmin: boolean; isBroker: boolean; orgName: string; plan: string }) {
  const path = usePathname();
  const { t } = useI18n();
  const base: readonly NavItem[] = isBroker ? NAV.filter((n) => !("carrierOnly" in n && n.carrierOnly)) : NAV;
  const items: readonly NavItem[] = isAdmin ? [...base, ADMIN_ITEM] : base;
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center px-5">
        <Link href="/app" aria-label={t("nav.dashboard")}>
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label={t("nav.main")}>
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
              {t(`nav.${n.label}`)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <div className="truncate text-sm font-medium">{orgName}</div>
          <div className="text-xs text-muted">{t("nav.plan", { plan })}</div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ userName, unread, search }: { userName: string; unread: number; search: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
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
        <Link href="/app" className="lg:hidden" aria-label={t("nav.dashboard")}>
          <Logo withText={false} />
        </Link>
        <div className="min-w-0 flex-1">{search}</div>
        <Link href="/app/notifications" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={unread ? t("nav.notificationsUnread", { n: unread }) : t("nav.notifications")}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
        </Link>
        <LanguageSwitcher />
        <ThemeToggle />
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand" aria-label={t("nav.accountMenu")} aria-expanded={menu}>
            {userName.slice(0, 1).toUpperCase()}
          </button>
          {menu && (
            <div className="absolute right-0 top-11 w-52 animate-fade-up rounded-xl border border-border bg-surface p-1.5 shadow-pop">
              <div className="truncate px-2.5 py-2 text-sm font-medium">{userName}</div>
              <Link href="/app/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <Settings className="h-4 w-4" /> {t("nav.settings")}
              </Link>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <LogOut className="h-4 w-4" /> {t("nav.signOut")}
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const base: readonly NavItem[] = isBroker ? NAV.filter((n) => !("carrierOnly" in n && n.carrierOnly)) : NAV;
  const primary = base.slice(0, 4);
  const more: NavItem[] = [...base.slice(4), ...(isAdmin ? [ADMIN_ITEM] : [])];
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t("nav.main")}>
        <div className="grid grid-cols-5">
          {primary.map((n) => {
            const active = isActive(path, n.href, "exact" in n ? n.exact : false);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-xs", active ? "text-brand" : "text-muted")}>
                <n.icon className="h-5 w-5" />
                {t(`nav.${SHORT[n.label] ?? n.label}`)}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted" aria-expanded={open}>
            <Menu className="h-5 w-5" /> {t("nav.more")}
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button className="absolute inset-0 bg-black/40" aria-label={t("nav.close")} onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{t("nav.more")}</span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted" aria-label={t("nav.close")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((n) => (
                <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 px-2 py-3 text-xs">
                  <n.icon className="h-5 w-5 text-brand" />
                  {t(`nav.${n.label}`)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
