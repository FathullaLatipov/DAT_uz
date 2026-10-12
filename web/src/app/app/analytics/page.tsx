import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { cityStats, laneStats, marketSummary, MIN_SAMPLES, routeTable } from "@/server/services/market";
import { getCity } from "@/server/domain/geo";
import { Badge, Card, CardHeader, DemoBadge, PageHeader, Stat, Trend } from "@/components/ui/primitives";
import { CityExplorer } from "@/components/analytics/city-explorer";
import { RateTrend } from "@/components/charts/lazy";
import { RouteLabel } from "@/components/loads/parts";
import { cn, perKm, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Market analytics" };

function opportunity(ds: number | null, trend: number | null) {
  if (ds == null) return { label: "No truck data", tone: "neutral" as const };
  if (ds >= 3 && (trend ?? 0) >= 0) return { label: "High opportunity", tone: "pos" as const };
  if (ds >= 1.5) return { label: "Favorable", tone: "brand" as const };
  if (ds >= 0.8) return { label: "Balanced", tone: "neutral" as const };
  return { label: "Oversupplied", tone: "warn" as const };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ lane?: string; country?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const country = sp.country === "all" ? undefined : (sp.country ?? "UZ");
  const [summary, routes, cities] = await Promise.all([marketSummary(), routeTable(), cityStats(country)]);
  const sufficient = routes.filter((r) => r.sufficient);
  const thin = routes.length - sufficient.length;
  const [lo, ld] = (sp.lane ?? (sufficient[0] ? `${sufficient[0].origin}>${sufficient[0].dest}` : "")).split(">");
  const lane = lo && ld ? await laneStats(lo, ld) : null;
  const carriersFavored = summary.loadsTrendPct != null && summary.loadsTrendPct > 0 && summary.demand !== "LOW";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Market intelligence"
        subtitle={`Calculated from freight in the database over the last 30–45 days. Lanes with fewer than ${MIN_SAMPLES} loads show “Insufficient market data”.`}
        badge={summary.isDemo ? <DemoBadge /> : undefined}
      />

      <Card className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
        <Stat label="Median rate (7 d)" value={perKm(summary.avgPerKm)} sub={<Trend value={summary.trendPct} />} />
        <Stat label="Active loads" value={summary.activeLoads} />
        <Stat label="New in 24 h" value={summary.newToday} />
        <Stat label="Load volume vs prior weeks" value={<Trend value={summary.loadsTrendPct} />} />
        <Stat label="Trucks available" value={summary.availableTrucks} sub="on the platform" />
        <Stat
          label="Market condition"
          value={<span className={cn("text-base", carriersFavored ? "text-pos" : "text-muted")}>{summary.activeLoads ? (carriersFavored ? "Favorable for carriers" : "Balanced") : "—"}</span>}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Freight heatmap · outbound demand</h2>
          <div className="flex gap-1 text-xs">
            {[["UZ", "Uzbekistan"], ["all", "All countries"]].map(([k, l]) => (
              <Link key={k} href={`/app/analytics?country=${k}${sp.lane ? `&lane=${sp.lane}` : ""}`} className={cn("rounded-md px-2 py-1", (sp.country ?? "UZ") === k ? "bg-surface-2 font-medium" : "text-muted hover:text-fg")}>{l}</Link>
            ))}
          </div>
        </div>
        <CityExplorer cities={cities} />
        <p className="border-t border-border px-4 py-2 text-xs text-subtle sm:px-5">Demand = active outbound loads per available truck in the city. Circle size = outbound loads.</p>
      </Card>

      {lane && (
        <Card>
          <CardHeader
            title="Lane trend"
            subtitle={<RouteLabel origin={lane.origin} dest={lane.dest} size="sm" className="font-medium text-fg" />}
          />
          <div className="grid gap-5 px-4 pb-5 sm:px-5 lg:grid-cols-[1fr_300px]">
            {lane.sufficient ? (
              <>
                <RateTrend data={lane.history} height={200} />
                <dl className="num grid grid-cols-2 content-start gap-4 text-sm">
                  <div><dt className="text-xs text-muted">Current (7 d median)</dt><dd className="text-lg font-semibold">{perKm(lane.current)}</dd></div>
                  <div><dt className="text-xs text-muted">Trend</dt><dd className="text-lg"><Trend value={lane.trendPct} /></dd></div>
                  <div><dt className="text-xs text-muted">7-day avg</dt><dd className="font-semibold">{perKm(lane.avg7)}</dd></div>
                  <div><dt className="text-xs text-muted">30-day avg</dt><dd className="font-semibold">{perKm(lane.avg30)}</dd></div>
                  <div><dt className="text-xs text-muted">Avg load value</dt><dd className="font-semibold">{usd(lane.avgRateUsd)}</dd></div>
                  <div><dt className="text-xs text-muted">Demand / supply</dt><dd className="font-semibold">{lane.demandSupply ?? "—"}</dd></div>
                </dl>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Info className="h-4 w-4" />Insufficient market data ({lane.samples} loads in 30 days).</p>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Route intelligence" subtitle={`${sufficient.length} lanes with enough data${thin ? ` · ${thin} lanes hidden (insufficient data)` : ""}. Click a lane for its trend.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Route</th>
                <th className="px-3 py-2.5 text-right font-medium">Median $/km</th>
                <th className="px-3 py-2.5 text-right font-medium">Min – Max</th>
                <th className="px-3 py-2.5 text-right font-medium">Avg load</th>
                <th className="px-3 py-2.5 text-right font-medium">Loads (30 d)</th>
                <th className="px-3 py-2.5 text-right font-medium">Active</th>
                <th className="px-3 py-2.5 text-right font-medium">Trucks at origin</th>
                <th className="px-3 py-2.5 text-right font-medium">D/S ratio</th>
                <th className="px-3 py-2.5 text-right font-medium">Trend</th>
                <th className="px-4 py-2.5 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-border">
              {sufficient.map((r) => {
                const op = opportunity(r.demandSupply, r.trendPct);
                const key = `${r.origin}>${r.dest}`;
                return (
                  <tr key={key} className={cn("relative transition-colors hover:bg-surface-2/70", sp.lane === key && "bg-brand-soft/40")}>
                    <td className="px-4 py-2.5">
                      <Link href={`/app/analytics?lane=${encodeURIComponent(key)}${sp.country ? `&country=${sp.country}` : ""}`} scroll={false} className="font-medium after:absolute after:inset-0">
                        {getCity(r.origin)?.name} → {getCity(r.dest)?.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{perKm(r.median)}</td>
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
      </Card>
    </div>
  );
}
