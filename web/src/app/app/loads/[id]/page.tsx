import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, ExternalLink, Info, Repeat, XCircle } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { getOfferDetail } from "@/server/services/freight";
import { brokerReliability } from "@/server/services/broker";
import { laneStats } from "@/server/services/market";
import { findBackhaul } from "@/server/services/backhaul";
import { estimateTollsUsd } from "@/server/services/profitability";
import { estimateTransitDays, freshGps } from "@/server/domain/geo";
import { MIN_SAMPLES } from "@/server/services/market";
import { getI18n } from "@/i18n/server";
import type { I18n } from "@/i18n/create";
import { parseJson } from "@/server/db";
import { Badge, Bar, Card, CardHeader, DemoBadge, ScoreBadge, Trend } from "@/components/ui/primitives";
import { Freshness, QualityBadge, RouteLabel } from "@/components/loads/parts";
import { FavoriteButton } from "@/components/loads/favorite-button";
import { ProfitCalculator } from "@/components/loads/profit-calculator";
import { AssignPanel } from "@/components/loads/assign-panel";
import { RouteMap } from "@/components/loads/route-map";
import { cn, pct } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("detail.title") };
}

export default async function LoadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ truck?: string }> }) {
  const s = await requireSession();
  const { t: tr, tn, label, city, country, ago, dateTime, km, money, perKm, shortDate, tonnes, usd, m: msgs } = await getI18n();
  const { id } = await params;
  const { truck: truckParam } = await searchParams;
  const i18n = await getI18n();
  const d = await getOfferDetail(s.orgId, s.userId, id);
  if (!d) notFound();
  const { offer: o, matches, flags } = d;

  const selected = matches.find((m) => m.truck.id === truckParam) ?? matches[0];
  const m = selected?.match;
  const t = selected?.truck;
  const [broker, lane, backhaul] = await Promise.all([
    o.brokerId ? brokerReliability(o.brokerId, i18n) : null,
    laneStats(o.originCityId, o.destCityId),
    t && m?.eligible
      ? findBackhaul(s.orgId, t, o.destCityId, new Date(Math.max(o.loadingDate.getTime(), m.readyAt.getTime()) + estimateTransitDays(o.distanceKm) * 86_400_000), 120, 3)
      : null,
  ]);
  const perKmRate = o.rateUsd / o.distanceKm;
  const requirements = parseJson<string[]>(o.requirements, []);
  const lastSynced = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href="/app/loads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {tr("nav.loadBoard")}
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <RouteLabel origin={o.originCityId} dest={o.destCityId} size="lg" className="sm:text-2xl" />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <QualityBadge quality={o.quality} flags={flags} />
            {o.status !== "ACTIVE" && <Badge tone="neg">{label(o.status)}</Badge>}
            {o.listings.length > 1 && <Badge tone="info">{tn("detail.foundOn", new Set(o.listings.map((l) => l.sourceId)).size)}</Badge>}
            {o.isDemo && <DemoBadge />}
            <Freshness lastSeen={lastSynced} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="num text-2xl font-semibold">{o.rateUsd > 0 ? usd(o.rateUsd) : tr("load.negotiable")}</div>
            {o.rateUsd > 0 && (
              <div className="num text-sm text-muted">
                {perKm(perKmRate)}
                {o.currency !== "USD" && ` · ${tr("panel.originalAmount", { amount: money(o.rate, o.currency) })}`}
              </div>
            )}
          </div>
          <FavoriteButton offerId={o.id} initial={d.favorite} withLabel />
        </div>
      </div>

      {/* At-a-glance trip strip — the facts a dispatcher scans first, before scrolling into cards */}
      <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Mini label={tr("detail.equipment")} value={label(o.bodyType)} />
        <Mini label={tr("load.weight")} value={tonnes(o.weightKg)} />
        <Mini label={tr("load.volume")} value={o.volumeM3 ? `${o.volumeM3} ${msgs.units.cubicMetres}` : "—"} />
        <Mini label={tr("load.distance")} value={km(o.distanceKm)} />
        <Mini label={tr("load.loading")} value={shortDate(o.loadingDate)} />
        <Mini label={tr("load.payment")} value={label(o.paymentTerms)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* Route */}
          <Card className="overflow-hidden">
            <div className="h-64 sm:h-80">
              <RouteMap origin={o.originCityId} dest={o.destCityId} truckCity={t?.currentCityId} truckPos={t ? freshGps(t) : null} truckCode={t?.code} className="h-full w-full" />
            </div>
            {m && (
              <div className="grid grid-cols-2 gap-4 border-t border-border p-4 sm:grid-cols-4 sm:p-5">
                <Mini label={tr("detail.totalDriving")} value={km(m.profit.totalKm)} />
                <Mini label={tr("detail.loaded")} value={km(m.profit.loadedKm)} />
                <Mini label={tr("detail.emptyDeadhead")} value={km(m.profit.emptyKm)} tone={m.profit.emptyPct > 0.2 ? "warn" : undefined} />
                <Mini label={tr("detail.emptyShare")} value={pct(m.profit.emptyPct, 1)} tone={m.profit.emptyPct > 0.2 ? "warn" : "pos"} />
              </div>
            )}
          </Card>

          {/* Cargo & schedule */}
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title={tr("load.cargo")} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-5 text-sm sm:px-5">
                <Def k={tr("detail.type")} v={label(o.cargoType)} />
                <Def k={tr("load.weight")} v={tonnes(o.weightKg)} />
                <Def k={tr("load.volume")} v={o.volumeM3 ? `${o.volumeM3} ${msgs.units.cubicMetres}` : "—"} />
                <Def k={tr("detail.bodyRequired")} v={label(o.bodyType)} />
                <Def k={tr("detail.packaging")} v={o.packaging ?? "—"} />
                <Def k={tr("load.requirements")} v={requirements.length ? requirements.join(", ") : "—"} />
              </dl>
            </Card>
            <Card>
              <CardHeader title={tr("detail.schedule")} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-5 text-sm sm:px-5">
                <Def k={tr("load.loading")} v={dateTime(o.loadingDate)} />
                <Def k={tr("load.unloading")} v={o.unloadingDate ? shortDate(o.unloadingDate) : "—"} />
                <Def k={tr("load.distance")} v={`${km(o.distanceKm)} ${msgs.units.est}`} />
                <Def k={tr("detail.transit")} v={`~${tn("route.days", estimateTransitDays(o.distanceKm))}`} />
                <Def k={tr("load.payment")} v={label(o.paymentTerms)} />
                <Def k={tr("detail.expires")} v={dateTime(o.expiresAt)} />
              </dl>
            </Card>
          </div>

          {/* Profitability */}
          <Card>
            <CardHeader title={tr("detail.profitability")} subtitle={t ? tr("detail.prefilled", { code: t.code }) : tr("detail.defaultProfile")} />
            <div className="px-4 pb-5 sm:px-5">
              <ProfitCalculator
                key={t?.id}
                initial={{
                  revenueUsd: Math.round(o.rateUsd),
                  loadedKm: Math.round(o.distanceKm),
                  deadheadKm: m?.deadheadKm ?? 0,
                  fuelLPer100km: t?.fuelLPer100km ?? 32,
                  fuelPriceUsd: t?.fuelPriceUsd ?? 0.95,
                  driverCostPerKm: t?.driverCostPerKm ?? 0.22,
                  maintenancePerKm: t?.maintenancePerKm ?? 0.08,
                  tollsUsd: estimateTollsUsd(o.distanceKm, o.originCountry, o.destCountry),
                  otherPerTripUsd: t?.otherPerTripUsd ?? 20,
                }}
              />
            </div>
          </Card>

          {/* Market */}
          <Card>
            <CardHeader title={tr("detail.market", { route: `${city(o.originCityId)} → ${city(o.destCityId)}` })} action={lane.isDemo ? <DemoBadge /> : undefined} />
            <div className="px-4 pb-5 sm:px-5">
              {lane.sufficient ? (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Mini label={tr("load.median30")} value={perKm(lane.median)} />
                    <Mini label={tr("load.range")} value={`${perKm(lane.min)} – ${lane.max?.toFixed(2)}`} />
                    <Mini label={tr("load.trend7")} value={<Trend value={lane.trendPct} />} />
                    <Mini label={tr("detail.thisOffer")} value={perKm(perKmRate)} tone={lane.median && perKmRate >= lane.median ? "pos" : "warn"} />
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {lane.median && (perKmRate >= lane.median ? tr("load.aboveMedian", { pct: Math.round((perKmRate / lane.median - 1) * 100), n: lane.samples }) : tr("load.belowMedian", { pct: Math.round((1 - perKmRate / lane.median) * 100), n: lane.samples }))}
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Info className="h-4 w-4" /> {tr("load.insufficient", { n: lane.samples, min: MIN_SAMPLES })}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <Card>
            <CardHeader title={tr("detail.aiMatch")} subtitle={t ? tr("detail.forTruck", { code: t.code, cap: (t.capacityKg / 1000).toFixed(0), body: label(t.bodyType).toLowerCase(), city: city(t.currentCityId) }) : tr("detail.addTruckMatching")} />
            {m && t ? (
              <div className="px-4 pb-5 sm:px-5">
                <div className="flex items-center gap-4">
                  <ScoreBadge score={m.score} eligible={m.eligible} size="lg" />
                  <div>
                    <div className="text-lg font-semibold">{m.eligible ? tr("panel.matchPct", { n: m.score }) : tr("panel.notEligible")}</div>
                    <div className="text-sm text-muted">{m.eligible ? tr("detail.estProfitIs", { profit: usd(m.profit.profit) }) : m.blockers[0]}</div>
                  </div>
                </div>
                {m.blockers.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {m.blockers.map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-neg"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{b}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 space-y-2.5">
                  {m.components.map((c) => (
                    <div key={c.key} title={c.detail}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{c.label} <span className="text-subtle">· {Math.round(c.weight * 100)}%</span></span>
                        <span className="num font-medium">{c.score}%</span>
                      </div>
                      <Bar value={c.score} tone={c.score >= 80 ? "pos" : c.score >= 55 ? "brand" : c.score >= 35 ? "warn" : "neg"} />
                      <div className="mt-0.5 truncate text-xs text-subtle">{c.detail}</div>
                    </div>
                  ))}
                </div>
                {m.reasons.length > 0 && (
                  <div className="mt-5 rounded-lg bg-surface-2 p-3.5">
                    <h3 className="text-sm font-semibold">{m.eligible ? tr("detail.whyRecommended") : tr("rec.whyThis")}</h3>
                    <ul className="mt-2 space-y-1.5">
                      {m.reasons.map((r) => <li key={r} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" />{r}</li>)}
                      {m.warnings.map((w) => <li key={w} className="flex gap-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
                    </ul>
                  </div>
                )}
                {matches.length > 1 && (
                  <div className="mt-5">
                    <div className="mb-1.5 text-xs font-medium text-muted">{tr("detail.compareTrucks")}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {matches.map((x) => (
                        <Link key={x.truck.id} href={`?truck=${x.truck.id}`} scroll={false}
                          className={cn("rounded-md border px-2 py-1 text-xs", x.truck.id === t.id ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-fg")}>
                          {x.truck.code} · {x.match.eligible ? `${x.match.score}%` : "—"}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{tr("detail.noTrucks")}</p>
            )}
          </Card>

          <Card id="assign" className="scroll-mt-20">
            <CardHeader title={tr("table.takeLoad")} />
            <div className="px-4 pb-5 sm:px-5">
              <AssignPanel
                offerId={o.id}
                canAssign={can(s, "trip:assign") && o.status === "ACTIVE"}
                defaultTruckId={t?.id}
                trucks={matches.map((x) => ({ id: x.truck.id, label: `${x.truck.code} — ${x.match.eligible ? `${x.match.score}% · ${usd(x.match.profit.profit)}` : tr("panel.notEligible").toLowerCase()}`, eligible: x.match.eligible }))}
              />
            </div>
          </Card>

          {backhaul && (
            <Card>
              <CardHeader title={tr("detail.returnPotential")} subtitle={tr("detail.nearAfter", { city: city(o.destCityId) })} action={<Repeat className="h-4 w-4 text-subtle" />} />
              <div className="px-4 pb-4 sm:px-5">
                {backhaul.options.length ? (
                  <ul className="space-y-2">
                    {backhaul.options.map((b) => (
                      <li key={b.offer.id}>
                        <Link href={`/app/loads/${b.offer.id}?truck=${t!.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                          <span className="truncate">{city(b.offer.originCityId)} → {city(b.offer.destCityId)}</span>
                          <span className="num shrink-0 text-xs"><span className="font-semibold">{usd(b.offer.rateUsd)}</span> · <span className="text-pos">{usd(b.match.profit.profit)}</span> · {b.match.score}%</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{tr("detail.noReturn", { city: city(o.destCityId) })}</p>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={tr("detail.company")} action={o.broker && <Link href={`/app/brokers/${o.broker.id}`} className="text-xs text-brand hover:underline">{tr("detail.viewProfile")}</Link>} />
            <div className="px-4 pb-5 sm:px-5">
              {o.broker ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{o.broker.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">
                        {o.broker.countryCode ? country(o.broker.countryCode) : tr("panel.locationUnknown")}
                        {o.broker.taxId && ` · ${tr("detail.taxId", { id: o.broker.taxId })}`}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {o.broker.verified ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> {tr("load.brokerVerified")}</Badge> : <Badge>{tr("load.brokerNotVerified")}</Badge>}
                        {o.broker.isDemo && <DemoBadge />}
                      </div>
                    </div>
                    {broker?.sufficient && <ReliabilityTier score={broker.score!} i={i18n} />}
                  </div>
                  {broker?.sufficient ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Mini label={tr("panel.rating")} value={`${broker.avgRating?.toFixed(1)} ★`} />
                      <Mini label={tr("detail.reviews")} value={broker.reviews} />
                      <Mini label={tr("detail.paidOnTime")} value={broker.paidOnTimePct != null ? `${broker.paidOnTimePct}%` : "—"} />
                      <Mini
                        label={tr("panel.disputes")}
                        value={broker.disputePct != null ? `${broker.disputePct}%` : "—"}
                        tone={broker.disputePct != null && broker.disputePct > 10 ? "warn" : undefined}
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">{broker?.explanation ?? tr("detail.noHistory")}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">{tr("detail.noBroker")}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={tr("detail.sources")} subtitle={tr("detail.lastSync", { ago: ago(lastSynced) })} />
            <ul className="divide-y divide-border border-t border-border">
              {o.listings.map((l, i) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      {l.source.name} {i === 0 && o.listings.length > 1 && <Badge tone="pos">{tr("detail.bestRate")}</Badge>}
                    </div>
                    <div className="text-xs text-muted">{tr("detail.idSeen", { id: l.externalId, ago: ago(l.lastSeenAt) })}</div>
                    {!l.source.isDemo && (l.contactName || l.contactPhone) && (
                      <div className="mt-1 text-sm">{l.contactName}{l.contactPhone && <a href={`tel:${l.contactPhone.replace(/[^+\d]/g, "")}`} className="ml-2 font-medium text-brand hover:underline">{l.contactPhone}</a>}</div>
                    )}
                  </div>
                  <div className="num shrink-0 text-right">
                    <div>{l.rate > 0 ? money(l.rate, l.currency) : "—"}</div>
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-brand">{tr("detail.original")} <ExternalLink className="h-3 w-3" /></a>
                    ) : (
                      <span className="text-xs text-subtle">{l.source.isDemo ? tr("detail.demoListing") : tr("detail.externalSource")}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">
              {tr("detail.contactsNote")}{" "}
              {o.isDemo && tr("detail.demoNote")}
            </div>
          </Card>

          {flags.filter((f) => f !== "EXPIRED").length > 0 && (
            <Card className="border-warn/40">
              <CardHeader title={tr("detail.qualityNotes")} />
              <ul className="space-y-1.5 px-4 pb-4 text-sm sm:px-5">
                {flags.filter((f) => f !== "EXPIRED").map((f) => <li key={f} className="flex gap-2 text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{msgs.issues[f] ?? f}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** A letter-grade reliability chip, computed from our own platform score (reviews, on-time
 * payment, disputes, cancellations — see brokerReliability()). Own wording/tiers, not a
 * reproduction of any third-party rating system. */
function ReliabilityTier({ score, i }: { score: number; i: I18n }) {
  const tier = score >= 85 ? { letter: "A", label: i.t("detail.tierA"), tone: "pos" as const }
    : score >= 70 ? { letter: "B", label: i.t("detail.tierB"), tone: "brand" as const }
    : score >= 55 ? { letter: "C", label: i.t("detail.tierC"), tone: "warn" as const }
    : { letter: "D", label: i.t("detail.tierD"), tone: "neg" as const };
  const toneClass = { pos: "bg-pos-soft text-pos", brand: "bg-brand-soft text-brand", warn: "bg-warn-soft text-warn", neg: "bg-neg-soft text-neg" }[tier.tone];
  return (
    <div className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-center", toneClass)} title={i.t("detail.reliabilityTitle", { score })}>
      <div className="text-lg font-bold leading-none">{tier.letter}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide">{tier.label}</div>
    </div>
  );
}

function Mini({ label: l, value, tone }: { label: string; value: React.ReactNode; tone?: "pos" | "warn" }) {
  return (
    <div>
      <div className="text-xs text-muted">{l}</div>
      <div className={cn("num mt-0.5 text-[15px] font-semibold", tone === "pos" && "text-pos", tone === "warn" && "text-warn")}>{value}</div>
    </div>
  );
}

function Def({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
