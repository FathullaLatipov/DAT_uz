import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Info } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { estimateRoadKm, estimateTransitDays } from "@/server/domain/geo";
import { getI18n } from "@/i18n/server";
import { offerInclude } from "@/server/services/freight";
import { parseRouteSlug, publicWhere, rateIsTrusted, routeSlug } from "@/server/services/catalog";
import { laneStats } from "@/server/services/market";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { CatalogTable } from "@/components/public/catalog-table";
import { CatalogTileList } from "@/components/public/catalog-tile-list";
import { RouteLabel } from "@/components/loads/parts";
import { RouteMap } from "@/components/loads/route-map";
import { DemoBadge, EmptyState, LinkButton, Trend } from "@/components/ui/primitives";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { t, city } = await getI18n();
  const r = parseRouteSlug((await params).slug);
  if (!r) return { title: t("meta.routeFallback") };
  return {
    title: t("meta.routeTitle", { route: `${city(r.o)} → ${city(r.d)}` }),
    description: t("meta.routeDescription", { origin: city(r.o), dest: city(r.d) }),
  };
}

export default async function RoutePage({ params }: Params) {
  const r = parseRouteSlug((await params).slug);
  if (!r) notFound();
  const { t, tn, km, perKm, usd, city } = await getI18n();
  const [session, loads, lane, reverseCount] = await Promise.all([
    getSession(),
    db.freightOffer.findMany({ where: { ...publicWhere(), originCityId: r.o, destCityId: r.d }, include: offerInclude, orderBy: { loadingDate: "asc" } }),
    laneStats(r.o, r.d),
    db.freightOffer.count({ where: { ...publicWhere(), originCityId: r.d, destCityId: r.o } }),
  ]);
  const distance = estimateRoadKm(r.o, r.d);
  const priced = loads.filter(rateIsTrusted);

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!session} />
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <nav className="text-xs text-muted" aria-label={t("catalog.breadcrumb")}>
          <Link href="/" className="hover:text-fg">{t("common.home")}</Link> / <Link href="/catalog" className="hover:text-fg">{t("common.loads")}</Link> / <span>{t("meta.routeFallback")}</span>
        </nav>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1><RouteLabel origin={r.o} dest={r.d} size="lg" className="sm:text-3xl" /></h1>
            <p className="mt-1 text-sm text-muted">{t("route.distanceLine", { km: km(distance), days: tn("route.days", estimateTransitDays(distance)), loads: tn("catalog.activeLoads", loads.length) })}</p>
          </div>
          {reverseCount > 0 && (
            <LinkButton href={`/routes/${routeSlug(r.d, r.o)}`} variant="outline" size="sm"><ArrowLeftRight className="h-4 w-4" /> {t("route.returnDirection", { n: reverseCount })}</LinkButton>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-56 overflow-hidden rounded-xl border border-border sm:h-72">
            <RouteMap origin={r.o} dest={r.d} className="h-full w-full" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("route.ratesTitle")}</h2>
              {lane.isDemo && <DemoBadge />}
            </div>
            {lane.sufficient ? (
              <dl className="num mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted">{t("route.median30")}</dt><dd className="text-lg font-semibold">{perKm(lane.median)}</dd></div>
                <div><dt className="text-xs text-muted">{t("route.trend7")}</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                <div><dt className="text-xs text-muted">{t("route.range")}</dt><dd>{perKm(lane.min)} – {lane.max?.toFixed(2)}</dd></div>
                <div><dt className="text-xs text-muted">{t("route.typicalLoad")}</dt><dd>{usd(lane.avgRateUsd)}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0" />{t("route.insufficient", { n: lane.samples })}</p>
            )}
            {priced.length > 0 && <p className="num mt-4 text-sm">{t("route.offersRange", { min: usd(Math.min(...priced.map((p) => p.rateUsd))), max: usd(Math.max(...priced.map((p) => p.rateUsd))) })}</p>}
            <LinkButton href={session ? `/app/loads?origin=${r.o}&dest=${r.d}` : "/signup"} className="mt-4 w-full">{session ? t("route.rankCta") : t("route.profitCta")}</LinkButton>
          </div>
        </div>

        <h2 className="mt-8 text-lg font-semibold">{t("route.loadsOnRoute")}</h2>
        {loads.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-surface">
            <EmptyState title={t("route.noneTitle")} body={t("route.noneBody")} actions={<LinkButton href={`/catalog?origin=${r.o}`} variant="outline">{t("route.loadsFrom", { city: city(r.o) })}</LinkButton>} />
          </div>
        ) : (
          <div className="mt-3">
            <CatalogTable items={loads} />
            <CatalogTileList items={loads} className="grid gap-3 sm:grid-cols-2 md:hidden" />
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
