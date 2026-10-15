import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  Info,
  ListChecks,
  Lock,
  Package,
  Route as RouteIcon,
  Scale,
  Truck,
  Wallet,
  Weight,
} from "lucide-react";
import { getSession } from "@/server/auth/session";
import { db, parseJson } from "@/server/db";
import { label } from "@/server/domain/enums";
import { estimateTransitDays, getCity } from "@/server/domain/geo";
import { routeSlug } from "@/server/services/catalog";
import { laneStats, MIN_SAMPLES } from "@/server/services/market";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { Freshness, QualityBadge, RouteLabel } from "@/components/loads/parts";
import { RouteMap } from "@/components/loads/route-map";
import { Badge, Card, CardHeader, DemoBadge, LinkButton, Trend } from "@/components/ui/primitives";
import { ago, cn, dateTime, km, money, perKm, shortDate, tonnes, usd } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return db.freightOffer.findUnique({ where: { id }, include: { broker: true, listings: { include: { source: true }, orderBy: { rateUsd: "desc" } } } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const o = await load((await params).id);
  if (!o) return { title: "Load" };
  return { title: `${getCity(o.originCityId)?.name} → ${getCity(o.destCityId)?.name}, ${tonnes(o.weightKg)} ${label(o.bodyType).toLowerCase()}` };
}

/** Public load page: everything except contacts and per-truck analysis, which need an account. */
export default async function PublicLoad({ params, searchParams }: Params & { searchParams: Promise<{ posted?: string }> }) {
  const { id } = await params;
  const { posted } = await searchParams;
  const [session, o] = await Promise.all([getSession(), load(id)]);
  if (!o) notFound();
  const lane = await laneStats(o.originCityId, o.destCityId);
  const trusted = o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE");
  const perKmRate = o.rateUsd / o.distanceKm;
  const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
  const reqs = parseJson<string[]>(o.requirements, []);
  const transitDays = estimateTransitDays(o.distanceKm);
  const details: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Package className="h-4 w-4" />, label: "Cargo", value: label(o.cargoType) },
    { icon: <Weight className="h-4 w-4" />, label: "Weight", value: tonnes(o.weightKg) },
    { icon: <Scale className="h-4 w-4" />, label: "Volume", value: o.volumeM3 ? `${o.volumeM3} m³` : "—" },
    { icon: <Truck className="h-4 w-4" />, label: "Truck body", value: label(o.bodyType) },
    { icon: <CalendarClock className="h-4 w-4" />, label: "Loading", value: dateTime(o.loadingDate) },
    { icon: <CalendarCheck2 className="h-4 w-4" />, label: "Unloading", value: o.unloadingDate ? shortDate(o.unloadingDate) : "—" },
    { icon: <RouteIcon className="h-4 w-4" />, label: "Distance", value: `${km(o.distanceKm)} (est.) · ~${transitDays} day(s)` },
    { icon: <Wallet className="h-4 w-4" />, label: "Payment", value: label(o.paymentTerms) },
    { icon: <ListChecks className="h-4 w-4" />, label: "Requirements", value: reqs.length ? reqs.join(", ") : "—" },
  ];

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!session} />
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {posted && (
          <div className="mb-4 rounded-lg border border-pos/30 bg-pos-soft px-3 py-2.5 text-sm text-pos">
            Your load is published and visible in the catalog. Carriers with matching trucks will see it ranked for them.
          </div>
        )}
        <nav className="text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-fg">Home</Link> / <Link href={`/routes/${routeSlug(o.originCityId, o.destCityId)}`} className="hover:text-fg">{getCity(o.originCityId)?.name} → {getCity(o.destCityId)?.name}</Link> / <span>Load</span>
        </nav>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1><RouteLabel origin={o.originCityId} dest={o.destCityId} size="lg" className="sm:text-3xl" /></h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <QualityBadge quality={o.quality} flags={parseJson(o.qualityFlags, [])} />
              {o.status !== "ACTIVE" && <Badge tone="neg">{o.status.toLowerCase()}</Badge>}
              {o.isDemo && <DemoBadge />}
              <Freshness lastSeen={lastSeen} />
            </div>
          </div>
          <div
            className={cn(
              "shrink-0 rounded-xl border px-5 py-3.5 sm:text-right",
              trusted ? "border-brand/30 bg-brand-soft" : "border-border bg-surface",
            )}
          >
            <div className={cn("num text-3xl font-bold tracking-tight", trusted ? "text-brand" : "text-fg")}>
              {trusted ? usd(o.rateUsd) : o.rateUsd > 0 ? "Rate unverified" : "Negotiable"}
            </div>
            {trusted ? (
              <div className="num mt-0.5 text-sm text-muted">{perKm(perKmRate)}{o.currency !== "USD" && ` · ${money(o.rate, o.currency)}`}</div>
            ) : (
              <div className="mt-0.5 text-sm text-muted">Contact to negotiate</div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="relative h-60 sm:h-80">
                <RouteMap origin={o.originCityId} dest={o.destCityId} className="h-full w-full" />
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium shadow-card backdrop-blur-sm">
                  <RouteIcon className="h-3.5 w-3.5 text-brand" /> {km(o.distanceKm)} · ~{transitDays} day(s)
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Shipment details" />
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-4 pb-5 text-sm sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
                {details.map((d) => (
                  <div key={d.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">{d.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs text-muted">{d.label}</div>
                      <div className="mt-0.5 font-medium">{d.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Market rate" subtitle={`${getCity(o.originCityId)?.name} → ${getCity(o.destCityId)?.name}`} action={lane.isDemo ? <DemoBadge /> : undefined} />
              <div className="px-4 pb-5 sm:px-5">
                {lane.sufficient ? (
                  <>
                    <dl className="num grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-muted">Median (30 d)</dt><dd className="text-lg font-semibold">{perKm(lane.median)}</dd></div>
                      <div><dt className="text-xs text-muted">Range</dt><dd className="text-lg">{perKm(lane.min)} – {lane.max?.toFixed(2)}</dd></div>
                      <div><dt className="text-xs text-muted">7-day trend</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                      {trusted && (
                        <div><dt className="text-xs text-muted">This load</dt><dd className="text-lg">{perKm(perKmRate)}</dd></div>
                      )}
                    </dl>
                    {!trusted && lane.median && (
                      <p className="mt-3 text-sm text-muted">No rate published for this load. Based on the lane median, a typical rate here is around <strong className="num text-fg">{usd(Math.round(lane.median * o.distanceKm))}</strong> ({perKm(lane.median)} × {km(o.distanceKm)}) — an estimate from recent market activity, not this load&apos;s own price.</p>
                    )}
                    {trusted && lane.median && (
                      <p className="mt-3 text-sm text-muted">This load is {perKmRate >= lane.median ? `${Math.round((perKmRate / lane.median - 1) * 100)}% above` : `${Math.round((1 - perKmRate / lane.median) * 100)}% below`} the lane median, based on {lane.samples} loads in the last 30 days.</p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted"><Info className="h-4 w-4 shrink-0" /> Insufficient market data for this lane ({lane.samples} loads in 30 days; need {MIN_SAMPLES}).</p>
                )}
              </div>
            </Card>
          </div>
          <aside className="space-y-5">
            <Card>
              <CardHeader title="Shipper / broker" />
              <div className="px-4 pb-5 sm:px-5">
                {o.broker ? (
                  <>
                    <div className="font-semibold">{o.broker.name}</div>
                    <div className="mt-1.5 flex gap-1.5">{o.broker.verified ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> Verified</Badge> : <Badge>Not verified</Badge>}</div>
                  </>
                ) : (
                  <p className="text-sm text-muted">Not specified by the source.</p>
                )}
                <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
                  <div className="flex items-center gap-1.5 font-medium"><Lock className="h-4 w-4 text-muted" /> Contacts & profit for your truck</div>
                  <p className="mt-1 text-muted">Sign in to see contact details, match score, deadhead and estimated profit.</p>
                </div>
                <LinkButton href={session ? `/app/loads/${o.id}` : `/login?next=${encodeURIComponent(`/app/loads/${o.id}`)}`} className="mt-3.5 w-full">
                  {session ? "Analyze for my trucks" : "Sign in to contact"}
                </LinkButton>
              </div>
            </Card>
            <Card>
              <CardHeader title="Where this load comes from" />
              <ul className="divide-y divide-border border-t border-border">
                {o.listings.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand hover:underline">
                        {l.source.name} ↗
                      </a>
                    ) : (
                      <span className="font-medium">{l.source.name}</span>
                    )}
                    <span className="text-xs text-muted">seen {ago(l.lastSeenAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
