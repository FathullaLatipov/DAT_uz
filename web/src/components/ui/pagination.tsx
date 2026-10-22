import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { pageRange, pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/format";
import { LinkPending } from "./link-pending";

const BASE = "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-sm font-medium transition-colors";

/** Numbered pager with "from–to of total". `href(p)` builds the URL of page p. */
export async function Pagination({ page, size, total, href }: { page: number; size: number; total: number; href: (p: number) => string }) {
  const { t, num } = await getI18n();
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const { from, to } = pageRange(page, size, total);
  const nav = (p: number, label: string, icon: React.ReactNode) => (
    <Link href={href(p)} aria-label={label} title={label} className={cn(BASE, "border-border bg-surface text-muted hover:border-brand hover:text-brand")}>
      {icon}
    </Link>
  );
  return (
    <nav className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label={t("catalog.pagination")}>
      <span className="num text-sm text-muted">{t("pager.showing", { from: num(from), to: num(to), total: num(total) })}</span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? nav(page - 1, t("pager.prev"), <ChevronLeft className="h-4 w-4" />) : <span className={cn(BASE, "cursor-not-allowed border-transparent text-subtle opacity-50")} aria-hidden><ChevronLeft className="h-4 w-4" /></span>}
        {pageWindow(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-subtle" aria-hidden>…</span>
          ) : p === page ? (
            <span key={p} aria-current="page" className={cn(BASE, "num border-brand bg-brand text-brand-fg shadow-card")}>{p}</span>
          ) : (
            <Link key={p} href={href(p)} aria-label={t("pager.go", { page: p })} className={cn(BASE, "num border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg")}>
              {p}
              <LinkPending className="h-3 w-3" />
            </Link>
          ),
        )}
        {page < pages ? nav(page + 1, t("pager.next"), <ChevronRight className="h-4 w-4" />) : <span className={cn(BASE, "cursor-not-allowed border-transparent text-subtle opacity-50")} aria-hidden><ChevronRight className="h-4 w-4" /></span>}
      </div>
    </nav>
  );
}
