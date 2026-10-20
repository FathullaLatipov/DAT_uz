"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  ExternalLink,
  Info,
  Lock,
  MapPinned,
  Package,
  Repeat,
  Route as RouteIcon,
  Scale,
  Truck,
  Wallet,
  Weight,
  XCircle,
} from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import type { LaneStats } from "@/server/services/market";
import type { BrokerReliability } from "@/server/services/broker";
import type { ScoreComponent } from "@/server/services/matching";
import type { CalcInput } from "./profit-calculator";
import { cn } from "@/lib/format";
import { Badge, Bar, DemoBadge, ScoreBadge, Select, Skeleton, Trend } from "../ui/primitives";
import { cargoFacts } from "@/lib/cargo-size";
import { ContactList } from "./contact-list";
import type { Sender } from "@/lib/enquiry";
import type { Contact } from "@/server/services/contacts";
import { RouteMap } from "./route-map";
import { RouteCard } from "./route-card";
import { ProfitCalculator } from "./profit-calculator";
import { AssignPanel } from "./assign-panel";

export interface LoadDetailResponse {
  authenticated: boolean;
  offer: {
    id: string; originCityId: string; destCityId: string; originCountry: string; destCountry: string;
    distanceKm: number; loadingDate: string; unloadingDate: string | null; bodyType: string; weightKg: number;
    volumeM3: number | null; cargoType: string; requirements: string[]; packaging: string | null; paymentTerms: string | null;
    rateUsd: number; rate: number; currency: string; status: string; quality: string; isDemo: boolean;
    qualityFlags: string[]; expiresAt: string; flags?: string[];
    cargoLengthM: number | null; cargoWidthM: number | null; cargoHeightM: number | null; oversize: boolean; adrClass: string | null;
  };
  broker: { id: string; name: string; verified: boolean; isDemo: boolean; countryCode: string | null; taxId: string | null } | null;
  brokerReliability: BrokerReliability | null;
  lane: LaneStats;
  listings: { id: string; sourceId: string; sourceName: string; sourceUrl: string | null; lastSeenAt: string; rate: number; currency: string; externalId: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null }[];
  listingsTotal: number;
  contacts: Contact[];
  viewer: Sender | null;
  favorite: boolean | null;
  canAssign: boolean;
  truckOptions: { id: string; label: string; eligible: boolean }[] | null;
  selectedTruckId: string | null;
  match: {
    score: number; eligible: boolean; blockers: string[]; components: ScoreComponent[]; reasons: string[]; warnings: string[];
    deadheadKm: number; benchmarkPerKm: number | null; truckId: string; truckCode: string; truckBody: string; truckCapacityKg: number; truckCity: string; truckPos?: { lat: number; lng: number } | null; calc: CalcInput;
  } | null;
  backhaul: { options: { offer: { id: string; originCityId: string; destCityId: string }; match: { score: number; profit: { profit: number } } }[] } | null;
}

/**
 * The expandable-row detail panel — same data an authenticated caller would get from
 * /app/loads/[id] or an anonymous visitor from /load/[id], fetched lazily (only for the row the
 * user actually opens) from GET /api/loads/[id]. `context` only changes which "open full page"
 * link and copy-this-URL target are used; the data shape already adapts itself via `authenticated`.
 */
export function LoadDetailPanel({ offerId, context }: { offerId: string; context: "board" | "catalog" }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: LoadDetailResponse }>({ status: "loading" });
  const [truckId, setTruckId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<"details" | "route" | null>(null);
  const { t, tn, m: msgs, label, city, country, km, tonnes, money, perKm, usd, ago, dateTime, shortDate } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    apiCall<LoadDetailResponse>(`/api/loads/${offerId}${truckId ? `?truck=${truckId}` : ""}`, "GET")
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: "error", message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [offerId, truckId]);

  const fullPageHref = context === "board" ? `/app/loads/${offerId}` : `/load/${offerId}`;

  if (state.status === "loading") {
    return (
      <div className="border-t border-border bg-surface-2/40 p-4 sm:p-5" role="region" aria-label={t("panel.loadingAria")}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="border-t border-border bg-surface-2/40 p-4 text-sm sm:p-5" role="alert">
        <p className="flex items-center gap-2 text-neg"><AlertTriangle className="h-4 w-4 shrink-0" /> {t("panel.couldntLoad", { message: state.message })}</p>
        <Link href={fullPageHref} className="mt-2 inline-block text-brand hover:underline">{t("panel.openFullInstead")}</Link>
      </div>
    );
  }

  const { data } = state;
  const { offer: o, broker, brokerReliability: rel, lane, listings, match: m } = data;
  const perKmRate = o.rateUsd > 0 && o.distanceKm > 0 ? o.rateUsd / o.distanceKm : null;
  const lastSeen = listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), listings[0]?.lastSeenAt ?? o.expiresAt);
  const anyContact = data.contacts.length > 0;

  const copyText = (text: string, which: "details" | "route") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const detailsText = () =>
    [
      `${city(o.originCityId)} → ${city(o.destCityId)}`,
      `${km(o.distanceKm)} · ${tonnes(o.weightKg)} · ${label(o.bodyType)} · ${label(o.cargoType)}`,
      t("panel.copyLoading", { when: dateTime(o.loadingDate) }),
      o.unloadingDate ? t("panel.copyUnloading", { when: shortDate(o.unloadingDate) }) : null,
      o.rateUsd > 0 ? t("panel.copyRate", { rate: `${usd(o.rateUsd)}${perKmRate ? ` (${perKm(perKmRate)})` : ""}` }) : t("panel.copyRateNegotiable"),
      `https://karvon.latipovfathulla.uz${fullPageHref}`,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="animate-fade-up border-t border-border bg-surface-2/40 p-4 sm:p-5" role="region" aria-label={t("panel.detailsAria")}>
      <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* Block A — route & trip */}
        <div className="min-w-0 space-y-3">
          <div className="h-44 overflow-hidden rounded-lg border border-border">
            {o.originCityId && o.destCityId ? (
              <RouteMap origin={o.originCityId} dest={o.destCityId} offerId={o.id} truckId={m?.truckId} truckCity={m?.truckCity} truckPos={m?.truckPos} truckCode={m?.truckCode} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">{t("panel.noCoords")}</div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
            <DetailField icon={<RouteIcon className="h-3.5 w-3.5" />} label={t("panel.distance")} value={`${km(o.distanceKm)} ${msgs.units.est}`} />
            <DetailField icon={<Truck className="h-3.5 w-3.5" />} label={t("panel.truckBody")} value={label(o.bodyType)} />
            <DetailField icon={<Weight className="h-3.5 w-3.5" />} label={t("panel.weight")} value={tonnes(o.weightKg)} />
            <DetailField icon={<Scale className="h-3.5 w-3.5" />} label={t("panel.volume")} value={o.volumeM3 ? `${o.volumeM3} ${msgs.units.cubicMetres}` : "—"} />
            <DetailField icon={<MapPinned className="h-3.5 w-3.5" />} label={t("panel.loading")} value={dateTime(o.loadingDate)} />
            <DetailField icon={<MapPinned className="h-3.5 w-3.5" />} label={t("panel.unloading")} value={o.unloadingDate ? shortDate(o.unloadingDate) : "—"} />
            <DetailField icon={<Package className="h-3.5 w-3.5" />} label={t("panel.cargo")} value={label(o.cargoType)} />
            <DetailField icon={<Wallet className="h-3.5 w-3.5" />} label={t("panel.payment")} value={o.paymentTerms ? label(o.paymentTerms) : "—"} />
          </dl>
          {(o.requirements.length > 0 || cargoFacts(o, t).length > 0) && (
            <p className="text-xs text-muted"><span className="font-medium text-fg">{t("panel.requirements")}</span> {[...cargoFacts(o, t), ...o.requirements].join(", ")}</p>
          )}
          <p className="text-xs text-subtle">
            {t("panel.listingLine", { listings: tn("panel.listings", data.listingsTotal ?? listings.length), id: listings[0]?.externalId ?? o.id.slice(0, 8), ago: ago(lastSeen) })}
          </p>
        </div>

        {/* Block B — rate & economics */}
        <div className="min-w-0 space-y-3">
          <div className="rounded-lg border border-border bg-surface p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="num text-xl font-semibold">{o.rateUsd > 0 ? usd(o.rateUsd) : t("panel.negotiable")}</span>
              {perKmRate && <span className="num text-sm text-muted">{perKm(perKmRate)}</span>}
            </div>
            {o.rateUsd > 0 && o.currency !== "USD" && <div className="num mt-0.5 text-xs text-subtle">{t("panel.originalAmount", { amount: money(o.rate, o.currency) })}</div>}
            <div className="mt-2.5 border-t border-border pt-2.5 text-xs">
              {lane.sufficient ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                  <span>{t("panel.marketMedian")} <strong className="num text-fg">{perKm(lane.median)}</strong></span>
                  <span>{t("panel.rangeLine", { min: perKm(lane.min), max: lane.max?.toFixed(2) ?? "—" })}</span>
                  <Trend value={lane.trendPct} />
                  {perKmRate && lane.median && (
                    <span className={perKmRate >= lane.median ? "text-pos" : "text-warn"}>
                      {t(perKmRate >= lane.median ? "panel.vsMarketUp" : "panel.vsMarketDown", { pct: Math.abs(Math.round((perKmRate / lane.median - 1) * 100)) })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-muted"><Info className="h-3.5 w-3.5 shrink-0" /> {t("panel.insufficientLane", { n: lane.samples })}</p>
              )}
            </div>
          </div>

          {data.authenticated && m ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ScoreBadge score={m.score} eligible={m.eligible} size="sm" />
                  <span className="text-sm font-medium">{m.eligible ? t("panel.matchPct", { n: m.score }) : t("panel.notEligible")}</span>
                </div>
                {data.truckOptions && data.truckOptions.length > 1 && (
                  <Select aria-label={t("panel.truck")} value={data.selectedTruckId ?? ""} onChange={(e) => setTruckId(e.target.value)} className="h-7 w-40 text-xs">
                    {data.truckOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </Select>
                )}
              </div>
              {m.blockers.length > 0 && (
                <ul className="space-y-1">
                  {m.blockers.map((b) => <li key={b} className="flex gap-1.5 text-xs text-neg"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{b}</li>)}
                </ul>
              )}
              {m.eligible && <RouteCard offerId={o.id} truckId={m.truckId} truckCode={m.truckCode} />}
              <ProfitCalculator initial={m.calc} compact />
            </>
          ) : !data.authenticated ? (
            <div className="rounded-lg bg-surface-2 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium"><Lock className="h-3.5 w-3.5 text-muted" /> {t("panel.profitLockedTitle")}</div>
              <p className="mt-1 text-muted">{t("panel.profitLockedBody")}</p>
            </div>
          ) : (
            <p className="text-xs text-muted">{t("panel.addTruck")}</p>
          )}
        </div>

        {/* Block C — broker, contacts, why this match, take it */}
        <div className="min-w-0 space-y-3 lg:col-span-2 xl:col-span-1">
          <div className="rounded-lg border border-border bg-surface p-3.5">
            {broker ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{broker.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{broker.countryCode ? country(broker.countryCode) : t("panel.locationUnknown")}</div>
                  </div>
                  {broker.verified ? <Badge tone="pos">{t("panel.verified")}</Badge> : <Badge>{t("panel.notVerified")}</Badge>}
                </div>
                {rel?.sufficient ? (
                  <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-center text-xs">
                    <div><div className="text-muted">{t("panel.rating")}</div><div className="font-semibold">{rel.avgRating?.toFixed(1)} ★</div></div>
                    <div><div className="text-muted">{t("panel.onTime")}</div><div className="font-semibold">{rel.paidOnTimePct ?? "—"}%</div></div>
                    <div><div className="text-muted">{t("panel.disputes")}</div><div className="font-semibold">{rel.disputePct ?? "—"}%</div></div>
                  </div>
                ) : data.authenticated ? (
                  <p className="mt-2 text-xs text-muted">{t("panel.noHistory")}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">{t("panel.brokerUnspecified")}</p>
            )}
          </div>

          {data.authenticated ? (
            anyContact ? (
              <ContactList
                contacts={data.contacts}
                ctx={{
                  originId: o.originCityId, destId: o.destCityId, weightKg: o.weightKg, bodyType: o.bodyType, loadingDate: o.loadingDate, rateUsd: o.rateUsd,
                  truck: m ? { code: m.truckCode, bodyType: m.truckBody, capacityKg: m.truckCapacityKg } : null,
                  viewer: data.viewer,
                }}
              />
            ) : (
              <p className="text-xs text-muted">{t("panel.noContacts")}</p>
            )
          ) : (
            <div className="rounded-lg bg-surface-2 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium"><Lock className="h-3.5 w-3.5 text-muted" /> {t("panel.contactsLockedTitle")}</div>
              <p className="mt-1 text-muted">{t("panel.contactsLockedBody")}</p>
            </div>
          )}

          {data.authenticated && m && (m.reasons.length > 0 || m.warnings.length > 0) && (
            <ul className="space-y-1.5 rounded-lg border border-border bg-surface p-3">
              {m.reasons.map((r) => <li key={r} className="flex gap-1.5 text-xs"><Check className="mt-0.5 h-3 w-3 shrink-0 text-pos" />{r}</li>)}
              {m.warnings.map((w) => <li key={w} className="flex gap-1.5 text-xs text-warn"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
            </ul>
          )}

          {data.authenticated && data.canAssign && data.truckOptions && (
            <AssignPanel offerId={o.id} trucks={data.truckOptions} defaultTruckId={data.selectedTruckId ?? undefined} canAssign={data.canAssign} />
          )}

          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            <button onClick={() => copyText(detailsText(), "details")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
              {copied === "details" ? <Check className="h-3 w-3 text-pos" /> : <Clipboard className="h-3 w-3" />} {t("panel.copyLoad")}
            </button>
            <button onClick={() => copyText(`${city(o.originCityId)} → ${city(o.destCityId)}`, "route")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
              {copied === "route" ? <Check className="h-3 w-3 text-pos" /> : <Clipboard className="h-3 w-3" />} {t("panel.copyRoute")}
            </button>
            {listings[0]?.sourceUrl && (
              <a href={listings[0].sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
                <ExternalLink className="h-3 w-3" /> {t("panel.openSource")}
              </a>
            )}
            <Link href={fullPageHref} className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-brand-fg hover:brightness-110">
              {t("panel.openFullPage")}
            </Link>
          </div>
        </div>
      </div>

      {/* Block D — score breakdown + return loads (authenticated with a truck only) */}
      {data.authenticated && m && (m.components.length > 0 || data.backhaul) && (
        <div className={cn("mt-5 grid gap-x-8 gap-y-5 border-t border-border pt-4", m.components.length > 0 && data.backhaul && "lg:grid-cols-[3fr_2fr]")}>
          {m.components.length > 0 && (
            <div className="min-w-0">
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("panel.whyScore")}</div>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                {m.components.map((c) => (
                  <div key={c.key} title={c.detail}>
                    <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{msgs.panel.components[c.key] ?? c.label}</span><span className="num font-medium">{c.score}%</span></div>
                    <Bar value={c.score} tone={c.score >= 80 ? "pos" : c.score >= 55 ? "brand" : c.score >= 35 ? "warn" : "neg"} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.backhaul && (
            <div className="min-w-0">
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Repeat className="h-3.5 w-3.5" /> {t("panel.returnLoads")}</div>
              {data.backhaul.options.length ? (
                <ul className="grid gap-1.5">
                  {data.backhaul.options.map((b) => (
                    <li key={b.offer.id}>
                      <Link href={`/app/loads/${b.offer.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-3">
                        <span className="truncate">{city(b.offer.originCityId)} → {city(b.offer.destCityId)}</span>
                        <span className="num shrink-0"><span className="text-pos">{usd(b.match.profit.profit)}</span> · {b.match.score}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">{t("panel.noReturn")}</p>
              )}
            </div>
          )}
        </div>
      )}

      {(o.isDemo || data.lane.isDemo) && (
        <div className="mt-3"><DemoBadge /></div>
      )}
    </div>
  );
}

function DetailField({ icon, label: l, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-subtle">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted">{l}</div>
        <div className="truncate font-medium">{value}</div>
      </div>
    </div>
  );
}
