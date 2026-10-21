import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { cityStats, laneStats, marketSummary, MIN_SAMPLES, routeTable } from "@/server/services/market";
import { getI18n } from "@/i18n/server";
import type { I18n } from "@/i18n/create";
import { Badge, Card, CardHeader, DemoBadge, PageHeader, Stat, Trend } from "@/components/ui/primitives";
import { CityExplorer } from "@/components/analytics/city-explorer";
import { RateTrend } from "@/components/charts/lazy";
import { RouteLabel } from "@/components/loads/parts";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("an.title") };
}

function opportunity(ds: number | null, trend: number | null, t: I18n["t"]) {
  if (ds == null) return { label: t("an.noTruckData"), tone: "neutral" as const };
  if (ds >= 3 && (trend ?? 0) >= 0) return { label: t("an.highOpp"), tone: "pos" as const };
  if (ds >= 1.5) return { label: t("an.favorable"), tone: "brand" as const };
  if (ds >= 0.8) return { label: t("an.balanced"), tone: "neutral" as const };
  return { label: t("an.oversupplied"), tone: "warn" as const };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ lane?: string; country?: string; window?: string }> }) {
  await requireSession();
  const { t, city, perKm, usd } = await getI18n();
  const sp = await searchParams;
  const country = sp.country === "all" ? undefined : (sp.country ?? "UZ");
  const win = sp.window === "7" ? "7" : "30";
  const [summary, routes, cities] = await Promise.all([marketSummary(), routeTable(), cityStats(country)]);
  const sufficient = routes.filter((r) => r.sufficient);
  const thin = routes.length - sufficient.length;
  const keepParams = (extra: Record<string, string | undefined>) => {
    const sp2 = new URLSearchParams();
    if (sp.country) sp2.set("country", sp.country);
    if (sp.lane) sp2.set("lane", sp.lane);
    if (win !== "30") sp2.set("window", win);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp2.set(k, v);
      else sp2.delete(k);
    }
    return `/app/analytics?${sp2.toString()}`;
  };
  const [lo, ld] = (sp.lane ?? (sufficient[0] ? `${sufficient[0].origin}>${sufficient[0].dest}` : "")).split(">");
  const lane = lo && ld ? await laneStats(lo, ld) : null;
  const carriersFavored = summary.loadsTrendPct != null && summary.loadsTrendPct > 0 && summary.demand !== "LOW";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title={t("an.header")}
        subtitle={t("an.subtitle", { min: MIN_SAMPLES })}
        badge={summary.isDemo ? <DemoBadge /> : undefined}
      />

      <Card className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
        <Stat label={t("an.median7")} value={perKm(summary.avgPerKm)} sub={<Trend value={summary.trendPct} />} />
        <Stat label={t("dash.activeLoads")} value={summary.activeLoads} />
        <Stat label={t("an.new24")} value={summary.newToday} />
        <Stat label={t("an.volume")} value={<Trend value={summary.loadsTrendPct} />} />
        <Stat label={t("an.trucksAvailable")} value={summary.availableTrucks} sub={t("an.onPlatform")} />
        <Stat
          label={t("an.condition")}
          value={<span className={cn("text-base", carriersFavored ? "text-pos" : "text-muted")}>{summary.activeLoads ? (carriersFavored ? t("an.favorableCarriers") : t("an.balanced")) : "—"}</span>}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("an.heatmap")}</h2>
          <div className="flex gap-1 text-xs">
            {[["UZ", t("an.uzbekistan")], ["all", t("an.allCountries")]].map(([k, l]) => (
              <Link key={k} href={keepParams({ country: k })} className={cn("rounded-md px-2 py-1", (sp.country ?? "UZ") === k ? "bg-surface-2 font-medium" : "text-muted hover:text-fg")}>{l}</Link>
            ))}
          </div>
        </div>
        <CityExplorer cities={cities} />
        <p className="border-t border-border px-4 py-2 text-xs text-subtle sm:px-5">{t("an.heatNote")}</p>
      </Card>

      {lane && (
        <Card>
          <CardHeader
            title={t("an.laneTrend")}
            subtitle={<RouteLabel origin={lane.origin} dest={lane.dest} size="sm" className="font-medium text-fg" />}
          />
          <div className="grid gap-5 px-4 pb-5 sm:px-5 lg:grid-cols-[1fr_300px]">
            {lane.sufficient ? (
              <>
                <RateTrend data={lane.history} height={200} />
                <dl className="num grid grid-cols-2 content-start gap-4 text-sm">
                  <div><dt className="text-xs text-muted">{t("an.current")}</dt><dd className="text-lg font-semibold">{perKm(lane.current)}</dd></div>
                  <div><dt className="text-xs text-muted">{t("an.trend")}</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                  <div><dt className="text-xs text-muted">{t("an.avg7")}</dt><dd className="font-semibold">{perKm(lane.avg7)}</dd></div>
                  <div><dt className="text-xs text-muted">{t("an.avg30")}</dt><dd className="font-semibold">{perKm(lane.avg30)}</dd></div>
                  <div><dt className="text-xs text-muted">{t("an.avgLoadValue")}</dt><dd className="font-semibold">{usd(lane.avgRateUsd)}</dd></div>
                  <div><dt className="text-xs text-muted">{t("an.demandSupply")}</dt><dd className="font-semibold">{lane.demandSupply ?? "—"}</dd></div>
                </dl>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Info className="h-4 w-4" />{t("route.insufficient", { n: lane.samples })}</p>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title={t("an.routeIntel")}
          subtitle={thin ? t("an.routeSubThin", { n: sufficient.length, thin }) : t("an.routeSub", { n: sufficient.length })}
          action={
            <div className="flex gap-1 text-xs">
              {(["7", "30"] as const).map((w) => (
                <Link key={w} href={keepParams({ window: w === "30" ? undefined : w })} className={cn("rounded-md px-2 py-1", win === w ? "bg-surface-2 font-medium" : "text-muted hover:text-fg")}>
                  {t(w === "7" ? "an.window7" : "an.window30")}
                </Link>
              ))}
            </div>
          }
        />
        {sufficient.length === 0 ? (
          <p className="flex items-center gap-2 px-4 pb-5 text-sm text-muted sm:px-5"><Info className="h-4 w-4 shrink-0" />{t("an.empty")}</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">{t("table.route")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colMedian", { days: win })}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colMinMax")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colAvgLoad")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colLoads30")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colActive")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colTrucks")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.colDs")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("an.trend")}</th>
                <th className="px-4 py-2.5 font-medium">{t("an.colSignal")}</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-border">
              {sufficient.map((r) => {
                const op = opportunity(r.demandSupply, r.trendPct, t);
                const key = `${r.origin}>${r.dest}`;
                return (
                  <tr key={key} className={cn("relative transition-colors hover:bg-surface-2/70", sp.lane === key && "bg-brand-soft/40")}>
                    <td className="px-4 py-2.5">
                      <Link href={keepParams({ lane: key })} scroll={false} className="font-medium after:absolute after:inset-0">
                        {city(r.origin)} → {city(r.dest)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{perKm(win === "7" ? r.current : r.median)}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{r.min?.toFixed(2)} – {r.max?.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right">{usd(r.avgRateUsd)}</td>
                    <td className="px-3 py-2.5 text-right">{r.samples}</td>
                    <td className="px-3 py-2.5 text-right">{r.activeLoads}</td>
                    <td className="px-3 py-2.5 text-right">{r.availableTrucks}</td>
                    <td className="px-3 py-2.5 text-right">{r.demandSupply ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right"><Trend value={r.trendPct} /></td>
                    <td className="px-4 py-2.5"><Badge tone={op.tone}>{op.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
