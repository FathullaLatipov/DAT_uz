import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Info } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCity, estimateRoadKm, estimateTransitDays } from "@/server/domain/geo";
import { offerInclude } from "@/server/services/freight";
import { parseRouteSlug, publicWhere, rateIsTrusted, routeSlug } from "@/server/services/catalog";
import { laneStats } from "@/server/services/market";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { LoadTile } from "@/components/public/load-tile";
import { CatalogTable } from "@/components/public/catalog-table";
import { RouteLabel } from "@/components/loads/parts";
import { RouteMap } from "@/components/loads/route-map";
import { DemoBadge, EmptyState, LinkButton, Trend } from "@/components/ui/primitives";
import { km, perKm, usd } from "@/lib/format";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = parseRouteSlug((await params).slug);
  if (!r) return { title: "Route" };
  const t = `${getCity(r.o)?.name} → ${getCity(r.d)?.name} freight loads`;
  return { title: t, description: `Active truck loads from ${getCity(r.o)?.name} to ${getCity(r.d)?.name}, rates per km and market trend.` };
}

export default async function RoutePage({ params }: Params) {
  const r = parseRouteSlug((await params).slug);
  if (!r) notFound();
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
        <nav className="text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-fg">Home</Link> / <Link href="/catalog" className="hover:text-fg">Loads</Link> / <span>Route</span>
        </nav>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1><RouteLabel origin={r.o} dest={r.d} size="lg" className="sm:text-3xl" /></h1>
            <p className="mt-1 text-sm text-muted">{km(distance)} (est.) · ~{estimateTransitDays(distance)} day(s) on the road · {loads.length} active load{loads.length === 1 ? "" : "s"}</p>
          </div>
          {reverseCount > 0 && (
            <LinkButton href={`/routes/${routeSlug(r.d, r.o)}`} variant="outline" size="sm"><ArrowLeftRight className="h-4 w-4" /> Return direction · {reverseCount}</LinkButton>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-56 overflow-hidden rounded-xl border border-border sm:h-72">
            <RouteMap origin={r.o} dest={r.d} className="h-full w-full" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Rates on this route</h2>
              {lane.isDemo && <DemoBadge />}
            </div>
            {lane.sufficient ? (
              <dl className="num mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted">Median (30 d)</dt><dd className="text-lg font-semibold">{perKm(lane.median)}</dd></div>
                <div><dt className="text-xs text-muted">7-day trend</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                <div><dt className="text-xs text-muted">Range</dt><dd>{perKm(lane.min)} – {lane.max?.toFixed(2)}</dd></div>
                <div><dt className="text-xs text-muted">Typical load</dt><dd>{usd(lane.avgRateUsd)}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0" />Insufficient market data for this route ({lane.samples} loads in 30 days).</p>
            )}
            {priced.length > 0 && <p className="mt-4 text-sm">Active offers from <strong className="num">{usd(Math.min(...priced.map((p) => p.rateUsd)))}</strong> to <strong className="num">{usd(Math.max(...priced.map((p) => p.rateUsd)))}</strong></p>}
            <LinkButton href={session ? `/app/loads?origin=${r.o}&dest=${r.d}` : "/signup"} className="mt-4 w-full">{session ? "Rank for my trucks" : "Get profit per truck — free"}</LinkButton>
          </div>
        </div>

        <h2 className="mt-8 text-lg font-semibold">Loads on this route</h2>
        {loads.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-surface">
            <EmptyState title="No active loads on this route right now" body="Check the return direction or nearby routes." actions={<LinkButton href={`/catalog?origin=${r.o}`} variant="outline">Loads from {getCity(r.o)?.name}</LinkButton>} />
          </div>
        ) : (
          <div className="mt-3">
            <CatalogTable items={loads} />
            <div className="grid gap-3 sm:grid-cols-2 md:hidden">{loads.map((o) => <LoadTile key={o.id} o={o} />)}</div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
