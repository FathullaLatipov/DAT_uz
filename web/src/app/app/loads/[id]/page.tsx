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
import { estimateTransitDays } from "@/server/domain/geo";
import { label } from "@/server/domain/enums";
import { parseJson } from "@/server/db";
import { Badge, Bar, Card, CardHeader, DemoBadge, ScoreBadge, Trend } from "@/components/ui/primitives";
import { cityLabel, Freshness, QualityBadge, RouteLabel } from "@/components/loads/parts";
import { FavoriteButton } from "@/components/loads/favorite-button";
import { ProfitCalculator } from "@/components/loads/profit-calculator";
import { AssignPanel } from "@/components/loads/assign-panel";
import { RouteMap } from "@/components/loads/route-map";
import { ago, cn, dateTime, km, money, pct, perKm, shortDate, tonnes, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Load details" };

const FLAG_TEXT: Record<string, string> = {
  SUSPICIOUS_RATE: "Rate is outside the plausible range for this distance",
  SUSPICIOUS_WEIGHT: "Weight exceeds a standard 44 t limit",
  IMPOSSIBLE_DATES: "Unloading date is before loading date",
  INVALID_CURRENCY: "Currency not recognized — rate ignored",
  NO_RATE: "No rate published",
  NO_BROKER: "No broker identified",
  UNKNOWN_BODY_TYPE: "Body type not specified — assumed curtainsider",
  EXPIRED: "Listing expired",
};

export default async function LoadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ truck?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const { truck: truckParam } = await searchParams;
  const d = await getOfferDetail(s.orgId, s.userId, id);
  if (!d) notFound();
  const { offer: o, matches, flags } = d;

  const selected = matches.find((m) => m.truck.id === truckParam) ?? matches[0];
  const m = selected?.match;
  const t = selected?.truck;
  const [broker, lane, backhaul] = await Promise.all([
    o.brokerId ? brokerReliability(o.brokerId) : null,
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
        <ArrowLeft className="h-4 w-4" /> Load board
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <RouteLabel origin={o.originCityId} dest={o.destCityId} size="lg" className="sm:text-2xl" />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <QualityBadge quality={o.quality} flags={flags} />
            {o.status !== "ACTIVE" && <Badge tone="neg">{o.status}</Badge>}
            {o.listings.length > 1 && <Badge tone="info">Found on {new Set(o.listings.map((l) => l.sourceId)).size} sources</Badge>}
            {o.isDemo && <DemoBadge />}
            <Freshness lastSeen={lastSynced} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="num text-2xl font-semibold">{o.rateUsd > 0 ? usd(o.rateUsd) : "Negotiable"}</div>
            {o.rateUsd > 0 && (
              <div className="num text-sm text-muted">
                {perKm(perKmRate)}
                {o.currency !== "USD" && ` · ${money(o.rate, o.currency)} original`}
              </div>
            )}
          </div>
          <FavoriteButton offerId={o.id} initial={d.favorite} withLabel />
        </div>
      </div>

      {/* At-a-glance trip strip — the facts a dispatcher scans first, before scrolling into cards */}
      <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Mini label="Equipment" value={label(o.bodyType)} />
        <Mini label="Weight" value={tonnes(o.weightKg)} />
        <Mini label="Volume" value={o.volumeM3 ? `${o.volumeM3} m³` : "—"} />
        <Mini label="Distance" value={km(o.distanceKm)} />
        <Mini label="Loading" value={shortDate(o.loadingDate)} />
        <Mini label="Payment" value={label(o.paymentTerms)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* Route */}
          <Card className="overflow-hidden">
            <div className="h-64 sm:h-80">
              <RouteMap origin={o.originCityId} dest={o.destCityId} truckCity={t?.currentCityId} truckCode={t?.code} className="h-full w-full" />
            </div>
            {m && (
              <div className="grid grid-cols-2 gap-4 border-t border-border p-4 sm:grid-cols-4 sm:p-5">
                <Mini label="Total driving" value={km(m.profit.totalKm)} />
                <Mini label="Loaded" value={km(m.profit.loadedKm)} />
                <Mini label="Empty (deadhead)" value={km(m.profit.emptyKm)} tone={m.profit.emptyPct > 0.2 ? "warn" : undefined} />
                <Mini label="Empty share" value={pct(m.profit.emptyPct, 1)} tone={m.profit.emptyPct > 0.2 ? "warn" : "pos"} />
              </div>
            )}
          </Card>

          {/* Cargo & schedule */}
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title="Cargo" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-5 text-sm sm:px-5">
                <Def k="Type" v={label(o.cargoType)} />
                <Def k="Weight" v={tonnes(o.weightKg)} />
                <Def k="Volume" v={o.volumeM3 ? `${o.volumeM3} m³` : "—"} />
                <Def k="Body required" v={label(o.bodyType)} />
                <Def k="Packaging" v={o.packaging ?? "—"} />
                <Def k="Requirements" v={requirements.length ? requirements.join(", ") : "—"} />
              </dl>
            </Card>
            <Card>
              <CardHeader title="Schedule & terms" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-5 text-sm sm:px-5">
                <Def k="Loading" v={dateTime(o.loadingDate)} />
                <Def k="Unloading" v={o.unloadingDate ? shortDate(o.unloadingDate) : "—"} />
                <Def k="Distance" v={`${km(o.distanceKm)} (est.)`} />
                <Def k="Transit" v={`~${estimateTransitDays(o.distanceKm)} day(s)`} />
                <Def k="Payment" v={label(o.paymentTerms)} />
                <Def k="Expires" v={dateTime(o.expiresAt)} />
              </dl>
            </Card>
          </div>

          {/* Profitability */}
          <Card>
            <CardHeader title="Profitability" subtitle={t ? `Pre-filled with ${t.code}'s cost profile — edit any value` : "Using default cost profile"} />
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
            <CardHeader title={`Market · ${cityLabel(o.originCityId)} → ${cityLabel(o.destCityId)}`} action={lane.isDemo ? <DemoBadge /> : undefined} />
            <div className="px-4 pb-5 sm:px-5">
              {lane.sufficient ? (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Mini label="Median (30 d)" value={perKm(lane.median)} />
                    <Mini label="Range" value={`${perKm(lane.min)} – ${lane.max?.toFixed(2)}`} />
                    <Mini label="7-day trend" value={<Trend value={lane.trendPct} />} />
                    <Mini label="This offer" value={perKm(perKmRate)} tone={lane.median && perKmRate >= lane.median ? "pos" : "warn"} />
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {lane.median && (perKmRate >= lane.median ? `This offer is ${Math.round((perKmRate / lane.median - 1) * 100)}% above` : `This offer is ${Math.round((1 - perKmRate / lane.median) * 100)}% below`)} the lane median, based on {lane.samples} loads in the last 30 days.
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Info className="h-4 w-4" /> Insufficient market data for this lane ({lane.samples} loads in 30 days; need 5).
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="AI match" subtitle={t ? `For ${t.code} · ${(t.capacityKg / 1000).toFixed(0)} t ${label(t.bodyType).toLowerCase()} in ${cityLabel(t.currentCityId)}` : "Add a truck to see matching"} />
            {m && t ? (
              <div className="px-4 pb-5 sm:px-5">
                <div className="flex items-center gap-4">
                  <ScoreBadge score={m.score} eligible={m.eligible} size="lg" />
                  <div>
                    <div className="text-lg font-semibold">{m.eligible ? `${m.score}% match` : "Not eligible"}</div>
                    <div className="text-sm text-muted">{m.eligible ? `Est. profit ${usd(m.profit.profit)}` : m.blockers[0]}</div>
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
                    <h3 className="text-sm font-semibold">Why this load {m.eligible ? "is recommended" : ""}</h3>
                    <ul className="mt-2 space-y-1.5">
                      {m.reasons.map((r) => <li key={r} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" />{r}</li>)}
                      {m.warnings.map((w) => <li key={w} className="flex gap-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
                    </ul>
                  </div>
                )}
                {matches.length > 1 && (
                  <div className="mt-5">
                    <div className="mb-1.5 text-xs font-medium text-muted">Compare trucks</div>
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
              <p className="px-5 pb-5 text-sm text-muted">No trucks in your fleet yet.</p>
            )}
          </Card>

          <Card id="assign" className="scroll-mt-20">
            <CardHeader title="Take this load" />
            <div className="px-4 pb-5 sm:px-5">
              <AssignPanel
                offerId={o.id}
                canAssign={can(s, "trip:assign") && o.status === "ACTIVE"}
                defaultTruckId={t?.id}
                trucks={matches.map((x) => ({ id: x.truck.id, label: `${x.truck.code} — ${x.match.eligible ? `${x.match.score}% · ${usd(x.match.profit.profit)}` : "not eligible"}`, eligible: x.match.eligible }))}
              />
            </div>
          </Card>

          {backhaul && (
            <Card>
              <CardHeader title="Return load potential" subtitle={`Near ${cityLabel(o.destCityId)} after delivery`} action={<Repeat className="h-4 w-4 text-subtle" />} />
              <div className="px-4 pb-4 sm:px-5">
                {backhaul.options.length ? (
                  <ul className="space-y-2">
                    {backhaul.options.map((b) => (
                      <li key={b.offer.id}>
                        <Link href={`/app/loads/${b.offer.id}?truck=${t!.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                          <span className="truncate">{cityLabel(b.offer.originCityId)} → {cityLabel(b.offer.destCityId)}</span>
                          <span className="num shrink-0 text-xs"><span className="font-semibold">{usd(b.offer.rateUsd)}</span> · <span className="text-pos">{usd(b.match.profit.profit)}</span> · {b.match.score}%</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No eligible return loads near {cityLabel(o.destCityId)} for the expected arrival window yet.</p>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Broker" />
            <div className="px-4 pb-5 sm:px-5">
              {o.broker ? (
                <>
                  <Link href={`/app/brokers/${o.broker.id}`} className="font-medium hover:underline">{o.broker.name}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {o.broker.verified ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> Verified</Badge> : <Badge>Not verified</Badge>}
                    {o.broker.isDemo && <DemoBadge />}
                  </div>
                  {broker?.sufficient ? (
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Reliability</span><span className="num text-lg font-semibold">{broker.score}<span className="text-sm text-muted">/100</span></span></div>
                      <Bar value={broker.score!} tone={broker.score! >= 75 ? "pos" : broker.score! >= 55 ? "warn" : "neg"} className="mt-1" />
                      <p className="mt-2 text-xs text-muted">{broker.avgRating?.toFixed(1)} ★ from {broker.reviews} reviews · {broker.paidOnTimePct ?? "—"}% paid on time</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">{broker?.explanation ?? "No history on the platform yet."}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">The source did not identify a broker or shipper.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Sources" subtitle={`Last synchronized ${ago(lastSynced)}`} />
            <ul className="divide-y divide-border border-t border-border">
              {o.listings.map((l, i) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      {l.source.name} {i === 0 && o.listings.length > 1 && <Badge tone="pos">Best rate</Badge>}
                    </div>
                    <div className="text-xs text-muted">ID {l.externalId} · seen {ago(l.lastSeenAt)}</div>
                    {!l.source.isDemo && (l.contactName || l.contactPhone) && (
                      <div className="mt-1 text-sm">{l.contactName}{l.contactPhone && <a href={`tel:${l.contactPhone.replace(/[^+\d]/g, "")}`} className="ml-2 font-medium text-brand hover:underline">{l.contactPhone}</a>}</div>
                    )}
                  </div>
                  <div className="num shrink-0 text-right">
                    <div>{l.rate > 0 ? money(l.rate, l.currency) : "—"}</div>
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-brand">Original <ExternalLink className="h-3 w-3" /></a>
                    ) : (
                      <span className="text-xs text-subtle">{l.source.isDemo ? "Demo listing" : "External source"}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">
              Contact details are shown only when the source provides them and permits their use.{" "}
              {o.isDemo && "Demo listings have no real contacts."}
            </div>
          </Card>

          {flags.filter((f) => f !== "EXPIRED").length > 0 && (
            <Card className="border-warn/40">
              <CardHeader title="Data quality notes" />
              <ul className="space-y-1.5 px-4 pb-4 text-sm sm:px-5">
                {flags.filter((f) => f !== "EXPIRED").map((f) => <li key={f} className="flex gap-2 text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{FLAG_TEXT[f] ?? f}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
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
