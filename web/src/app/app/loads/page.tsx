import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
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
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.loadBoard") };
}

const PAGE_SIZE = 50;

export default async function LoadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const { t, tn, label } = await getI18n();
  const sp = await searchParams;
  const filters = filtersFromParams(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const view = (typeof sp.view === "string" && ["list", "map", "split"].includes(sp.view) ? sp.view : "list") as "list" | "map" | "split";
  const nl = typeof sp.nl === "string" ? sp.nl : null;

  const [trucks, sources, brokers] = await Promise.all([
    db.truck.findMany({ where: { orgId: s.orgId }, select: { id: true, code: true, bodyType: true, capacityKg: true }, orderBy: { code: "asc" } }),
    db.freightSource.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    db.broker.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const resultsKey = filtersToParams(filters).toString();

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title={t("nav.loadBoard")}
        subtitle={trucks.length ? tn("board.subtitle", trucks.length) : t("board.subtitleNoTrucks")}
      />
      {nl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/50 px-3 py-2 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-brand" />
          <span className="truncate">{t("board.resultsFor", { q: nl })}</span>
          <Link href="/app/loads" className="ml-auto shrink-0 text-xs text-brand hover:underline">{t("board.clear")}</Link>
        </div>
      )}
      <div className="mb-3">
        <nav className="mb-3 inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm" aria-label={t("toolbar.routeType")}>
          {([["", t("board.scopeAll")], ["domestic", t("board.scopeUz")], ["international", t("board.scopeIntl")]] as const).map(([k, text]) => {
            const q = filtersToParams({ ...filters, scope: (k || undefined) as typeof filters.scope });
            if (view !== "list") q.set("view", view);
            const on = (filters.scope ?? "") === k;
            return (
              <Link key={k} href={`/app/loads?${q.toString()}`} aria-current={on ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", on ? "bg-brand text-white" : "text-muted hover:text-fg")}>
                {text}
              </Link>
            );
          })}
        </nav>
        <SearchToolbar key={filtersToParams(filters).toString()} trucks={trucks.map((x) => ({ id: x.id, name: `${x.code} · ${(x.capacityKg / 1000).toFixed(0)} ${t("units.tonnes")} ${label(x.bodyType).toLowerCase()}` }))} sources={sources} brokers={brokers} />
      </div>
      <div className="flex flex-col items-start gap-3 lg:flex-row lg:gap-5">
        <div className="w-full min-w-0 flex-1">
          <Suspense key={`${resultsKey}|${page}|${view}`} fallback={<BoardSkeleton label={t("pager.loading")} />}>
            <BoardResults orgId={s.orgId} userId={s.userId} filters={filters} page={page} view={view} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

type Filters = ReturnType<typeof filtersFromParams>;

function BoardSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      <div className="h-8" />
      <Card className="overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-surface-2" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="hidden h-4 w-24 animate-pulse rounded bg-surface-2 md:block" />
            <div className="hidden h-4 w-16 animate-pulse rounded bg-surface-2 md:block" />
          </div>
        ))}
      </Card>
    </div>
  );
}

async function BoardResults({ orgId, userId, filters, page, view }: { orgId: string; userId: string; filters: Filters; page: number; view: "list" | "map" | "split" }) {
  const { t } = await getI18n();
  const mobile = /Mobi|Android|iPhone/i.test((await headers()).get("user-agent") ?? "");
  const res = await searchLoads(orgId, userId, filters, page, PAGE_SIZE, { all: view !== "list" });
  // The board shows scores, deadhead and profit only; the explanation text (several kB per row, sent twice because
  // the table and the card list both receive the rows) is loaded with a row's details when it is opened.
  const rows = res.rows.map((r) => (r.match ? { ...r, match: { ...r.match, components: [], reasons: [], warnings: [], blockers: [] } } : r));
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
        {/* One list, chosen by device: rendering both (and hiding one with CSS) doubled the HTML and the hydration work. */}
        {mobile ? (
          <LoadCardList key={`m-${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={rows} className="grid grid-cols-1 gap-3 [&>*]:min-w-0" />
        ) : (
          <LoadTable key={`${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={rows} filters={filters} view={view} />
        )}
        <Pagination page={page} size={PAGE_SIZE} total={res.total} href={pageHref} />
      </>
    );


  return (
    <>
      <div className="mb-3">
        <BoardToolbar total={res.total} view={view} />
      </div>
      {view === "map" ? (
        <div className="space-y-4">
          <div className="h-[60dvh] min-h-[360px] overflow-hidden rounded-xl border border-border">
            <BoardMap items={res.all} className="h-full w-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{rows.slice(0, 9).map((r) => <LoadCard key={r.offer.id} row={r} compact />)}</div>
        </div>
      ) : view === "split" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {res.rows.length ? (
            <LoadCardList key={`s-${filtersToParams(filters).toString()}-${page}-${filters.sort ?? ""}`} rows={rows} className="grid content-start gap-3" />
          ) : (
            <div className="grid content-start gap-3">{results}</div>
          )}
          <div className={cn("sticky top-20 hidden h-[min(440px,calc(100dvh-7rem))] overflow-hidden rounded-xl border border-border xl:block")}>
            <BoardMap items={res.all} className="h-full w-full" />
          </div>
        </div>
      ) : (
        results
      )}
    </>
  );
}
