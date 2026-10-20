import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { transitDaysWithBorders } from "@/server/domain/borders";
import { getI18n } from "@/i18n/server";
import { routeSlug } from "@/server/services/catalog";
import { laneStats, MIN_SAMPLES } from "@/server/services/market";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { Freshness, QualityBadge, RouteLabel } from "@/components/loads/parts";
import { RouteMap } from "@/components/loads/route-map";
import { Badge, Card, CardHeader, DemoBadge, LinkButton, Trend } from "@/components/ui/primitives";
import { cargoFacts } from "@/lib/cargo-size";
import { cn } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return db.freightOffer.findUnique({ where: { id }, include: { broker: true, listings: { include: { source: true }, orderBy: { rateUsd: "desc" } } } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { t, city, label, tonnes } = await getI18n();
  const o = await load((await params).id);
  if (!o) return { title: t("meta.loadFallback") };
  return { title: `${city(o.originCityId)} → ${city(o.destCityId)}, ${tonnes(o.weightKg)} ${label(o.bodyType).toLowerCase()}` };
}

/** Public load page: everything except contacts and per-truck analysis, which need an account. */
export default async function PublicLoad({ params, searchParams }: Params & { searchParams: Promise<{ posted?: string }> }) {
  const { id } = await params;
  const { posted } = await searchParams;
  const { t, tn, label, city, ago, dateTime, km, money, perKm, shortDate, tonnes, usd, m: msgs } = await getI18n();
  const [session, o] = await Promise.all([getSession(), load(id)]);
  if (!o) notFound();
  // Signed-in people get the full page (contacts, match for their trucks, profit); this one is for visitors and search engines.
  if (session) redirect(`/app/loads/${o.id}${posted ? "?posted=1" : ""}`);
  const lane = await laneStats(o.originCityId, o.destCityId);
  const trusted = o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE");
  const perKmRate = o.rateUsd / o.distanceKm;
  const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
  const reqs = parseJson<string[]>(o.requirements, []);
  const transitDays = transitDaysWithBorders(o.distanceKm, o.originCountry, o.destCountry);
  const details: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Package className="h-4 w-4" />, label: t("load.cargo"), value: label(o.cargoType) },
    { icon: <Weight className="h-4 w-4" />, label: t("load.weight"), value: tonnes(o.weightKg) },
    { icon: <Scale className="h-4 w-4" />, label: t("load.volume"), value: o.volumeM3 ? `${o.volumeM3} ${msgs.units.cubicMetres}` : "—" },
    { icon: <Truck className="h-4 w-4" />, label: t("load.truckBody"), value: label(o.bodyType) },
    { icon: <CalendarClock className="h-4 w-4" />, label: t("load.loading"), value: dateTime(o.loadingDate) },
    { icon: <CalendarCheck2 className="h-4 w-4" />, label: t("load.unloading"), value: o.unloadingDate ? shortDate(o.unloadingDate) : "—" },
    { icon: <RouteIcon className="h-4 w-4" />, label: t("load.distance"), value: t("load.distanceValue", { km: km(o.distanceKm), days: tn("route.days", transitDays) }) },
    { icon: <Wallet className="h-4 w-4" />, label: t("load.payment"), value: label(o.paymentTerms) },
    { icon: <ListChecks className="h-4 w-4" />, label: t("load.requirements"), value: reqs.length || cargoFacts(o, t).length ? [...cargoFacts(o, t), ...reqs].join(", ") : "—" },
  ];

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!session} />
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {posted && (
          <div className="mb-4 rounded-lg border border-pos/30 bg-pos-soft px-3 py-2.5 text-sm text-pos">
            {t("load.published")}
          </div>
        )}
        <nav className="text-xs text-muted" aria-label={t("catalog.breadcrumb")}>
          <Link href="/" className="hover:text-fg">{t("common.home")}</Link> / <Link href={`/routes/${routeSlug(o.originCityId, o.destCityId)}`} className="hover:text-fg">{city(o.originCityId)} → {city(o.destCityId)}</Link> / <span>{t("load.breadcrumbLoad")}</span>
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
              {trusted ? usd(o.rateUsd) : o.rateUsd > 0 ? t("load.rateUnverified") : t("load.negotiable")}
            </div>
            {trusted ? (
              <div className="num mt-0.5 text-sm text-muted">{perKm(perKmRate)}{o.currency !== "USD" && ` · ${money(o.rate, o.currency)}`}</div>
            ) : (
              <div className="mt-0.5 text-sm text-muted">{t("load.contactToNegotiate")}</div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="relative h-60 sm:h-80">
                <RouteMap origin={o.originCityId} dest={o.destCityId} className="h-full w-full" />
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium shadow-card backdrop-blur-sm">
                  <RouteIcon className="h-3.5 w-3.5 text-brand" /> {km(o.distanceKm)} · ~{tn("route.days", transitDays)}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t("load.shipmentDetails")} />
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
              <CardHeader title={t("load.marketRate")} subtitle={`${city(o.originCityId)} → ${city(o.destCityId)}`} action={lane.isDemo ? <DemoBadge /> : undefined} />
              <div className="px-4 pb-5 sm:px-5">
                {lane.sufficient ? (
                  <>
                    <dl className="num grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-muted">{t("load.median30")}</dt><dd className="text-lg font-semibold">{perKm(lane.median)}</dd></div>
                      <div><dt className="text-xs text-muted">{t("load.range")}</dt><dd className="text-lg">{perKm(lane.min)} – {lane.max?.toFixed(2)}</dd></div>
                      <div><dt className="text-xs text-muted">{t("load.trend7")}</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                      {trusted && (
                        <div><dt className="text-xs text-muted">{t("load.thisLoad")}</dt><dd className="text-lg">{perKm(perKmRate)}</dd></div>
                      )}
                    </dl>
                    {!trusted && lane.median && (
                      <p className="num mt-3 text-sm text-muted">{t("load.noRateEstimate", { amount: usd(Math.round(lane.median * o.distanceKm)), perKm: perKm(lane.median), km: km(o.distanceKm) })}</p>
                    )}
                    {trusted && lane.median && (
                      <p className="mt-3 text-sm text-muted">{perKmRate >= lane.median ? t("load.aboveMedian", { pct: Math.round((perKmRate / lane.median - 1) * 100), n: lane.samples }) : t("load.belowMedian", { pct: Math.round((1 - perKmRate / lane.median) * 100), n: lane.samples })}</p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted"><Info className="h-4 w-4 shrink-0" /> {t("load.insufficient", { n: lane.samples, min: MIN_SAMPLES })}</p>
                )}
              </div>
            </Card>
          </div>
          <aside className="space-y-5">
            <Card>
              <CardHeader title={t("load.broker")} />
              <div className="px-4 pb-5 sm:px-5">
                {o.broker ? (
                  <>
                    <div className="font-semibold">{o.broker.name}</div>
                    <div className="mt-1.5 flex gap-1.5">{o.broker.verified ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> {t("load.brokerVerified")}</Badge> : <Badge>{t("load.brokerNotVerified")}</Badge>}</div>
                  </>
                ) : (
                  <p className="text-sm text-muted">{t("load.notSpecified")}</p>
                )}
                <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
                  <div className="flex items-center gap-1.5 font-medium"><Lock className="h-4 w-4 text-muted" /> {t("load.lockedTitle")}</div>
                  <p className="mt-1 text-muted">{t("load.lockedBody")}</p>
                </div>
                <LinkButton href={session ? `/app/loads/${o.id}` : `/login?next=${encodeURIComponent(`/app/loads/${o.id}`)}`} className="mt-3.5 w-full">
                  {session ? t("load.analyze") : t("load.signInToContact")}
                </LinkButton>
              </div>
            </Card>
            <Card>
              <CardHeader title={t("load.sourcesTitle")} />
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
                    <span className="text-xs text-muted">{t("load.seen", { ago: ago(l.lastSeenAt) })}</span>
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
