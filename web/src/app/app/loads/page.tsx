import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch, Sparkles } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { getI18n } from "@/i18n/server";
import { db } from "@/server/db";
import { filtersFromParams, filtersToParams } from "@/server/services/filters";
import { searchLoads } from "@/server/services/freight";
import { SearchToolbar } from "@/components/loads/search-toolbar";
import { BoardToolbar } from "@/components/loads/board-toolbar";
import { LoadTable } from "@/components/loads/load-table";
import { LoadCard } from "@/components/loads/parts";
import { LoadCardList } from "@/components/loads/load-card-list";
import { BoardMap } from "@/components/loads/board-map";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.loadBoard") };
}

const PAGE_SIZE = 25;

export default async function LoadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const { t, tn, label } = await getI18n();
  const sp = await searchParams;
  const filters = filtersFromParams(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const view = (typeof sp.view === "string" && ["list", "map", "split"].includes(sp.view) ? sp.view : "list") as "list" | "map" | "split";
  const nl = typeof sp.nl === "string" ? sp.nl : null;

  const [res, trucks, sources, brokers] = await Promise.all([
    searchLoads(s.orgId, s.userId, filters, page, PAGE_SIZE),
    db.truck.findMany({ where: { orgId: s.orgId }, select: { id: true, code: true, bodyType: true, capacityKg: true }, orderBy: { code: "asc" } }),
    db.freightSource.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    db.broker.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const q = filtersToParams(filters);
    if (view !== "list") q.set("view", view);
    if (p > 1) q.set("page", String(p));
    return `/app/loads?${q.toString()}`;
  };

  const results =
    res.rows.length === 0 ? (
      <Card>
        <EmptyState
          icon={<PackageSearch className="h-5 w-5" />}
          title={res.truckCount ? t("board.noMatchTrucks") : t("board.noMatch")}
          body={
            <ul className="mt-1 space-y-1 text-left">
              <li>• {t("board.tip1")}</li>
              <li>• {t("board.tip2")}</li>
              <li>• {t("board.tip3")}</li>
              <li>• {t("board.tip4")}</li>
            </ul>
          }
          actions={<LinkButton href="/app/loads" variant="outline">{t("catalog.clearFilters")}</LinkButton>}
        />
      </Card>
    ) : (
      <>
        <div className="hidden md:block">
          <LoadTable key={`${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={res.rows} filters={filters} view={view} />
        </div>
        <LoadCardList key={`m-${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={res.rows} className="grid grid-cols-1 gap-3 md:hidden [&>*]:min-w-0" />
        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label={t("catalog.pagination")}>
            <span className="text-muted">{t("catalog.pageOf", { page, pages })}</span>
            <div className="flex gap-2">
              {page > 1 && <LinkButton variant="outline" size="sm" href={pageHref(page - 1)}>{t("catalog.previous")}</LinkButton>}
              {page < pages && <LinkButton variant="outline" size="sm" href={pageHref(page + 1)}>{t("catalog.next")}</LinkButton>}
            </div>
          </nav>
        )}
      </>
    );

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title={t("nav.loadBoard")}
        subtitle={res.truckCount ? tn("board.subtitle", res.truckCount) : t("board.subtitleNoTrucks")}
      />
      {nl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/50 px-3 py-2 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-brand" />
          <span className="truncate">{t("board.resultsFor", { q: nl })}</span>
          <Link href="/app/loads" className="ml-auto shrink-0 text-xs text-brand hover:underline">{t("board.clear")}</Link>
        </div>
      )}
      <div className="mb-3">
        <SearchToolbar key={filtersToParams(filters).toString()} trucks={trucks.map((x) => ({ id: x.id, name: `${x.code} · ${(x.capacityKg / 1000).toFixed(0)} ${t("units.tonnes")} ${label(x.bodyType).toLowerCase()}` }))} sources={sources} brokers={brokers} />
      </div>
      <div className="flex flex-col items-start gap-3 lg:flex-row lg:gap-5">
        <div className="w-full min-w-0 flex-1">
          <div className="mb-3">
            <BoardToolbar total={res.total} view={view} />
          </div>
          {view === "map" ? (
            <div className="space-y-4">
              <div className="h-[60dvh] min-h-[360px] overflow-hidden rounded-xl border border-border">
                <BoardMap items={res.all} className="h-full w-full" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{res.rows.slice(0, 9).map((r) => <LoadCard key={r.offer.id} row={r} compact />)}</div>
            </div>
          ) : view === "split" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {res.rows.length ? (
                <LoadCardList key={`s-${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={res.rows} className="grid content-start gap-3" />
              ) : (
                <div className="grid content-start gap-3">{results}</div>
              )}
              <div className={cn("sticky top-20 hidden h-[calc(100dvh-7rem)] overflow-hidden rounded-xl border border-border xl:block")}>
                <BoardMap items={res.all} className="h-full w-full" />
              </div>
            </div>
          ) : (
            results
          )}
        </div>
      </div>
    </div>
  );
}
