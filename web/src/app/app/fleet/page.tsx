import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { label } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";
import { fleetSummary } from "@/server/services/fleet";
import { Card, DemoBadge, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/fleet/status-badge";
import { FleetMap } from "@/components/fleet/fleet-map";
import { dateTime, pct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Fleet" };

export default async function FleetPage() {
  const s = await requireSession();
  if (s.role === "BROKER") redirect("/app/post");
  const [trucks, summary, routes] = await Promise.all([
    db.truck.findMany({
      where: { orgId: s.orgId },
      include: { driver: true, trips: { where: { status: { in: ["PLANNED", "IN_TRANSIT"] } }, take: 1, orderBy: { startedAt: "desc" } } },
      orderBy: { code: "asc" },
    }),
    fleetSummary(s.orgId),
    db.preferredRoute.findMany({ where: { orgId: s.orgId } }),
  ]);
  const canWrite = can(s, "truck:write");
  const routeText = routes.map((r) => `${getCity(r.originCityId)?.name} → ${r.destCityId ? getCity(r.destCityId)?.name : r.destCountry}`).join(" · ");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Fleet"
        subtitle={routeText ? `Preferred routes: ${routeText}` : "Set preferred routes in Settings to boost matching loads."}
        actions={canWrite && <LinkButton href="/app/fleet/new"><Plus className="h-4 w-4" /> Add truck</LinkButton>}
      />
      {trucks.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck className="h-5 w-5" />} title="No trucks yet" body="Add a truck with its body type, capacity and location — recommendations start immediately." actions={canWrite && <LinkButton href="/app/fleet/new">Add truck</LinkButton>} />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
            <Stat label="Trucks" value={summary.total} />
            <Stat label="Available" value={summary.available} tone="pos" />
            <Stat label="On route" value={summary.onRoute} />
            <Stat label="Maintenance" value={summary.maintenance} />
            <Stat label="Utilization (30 d)" value={pct(summary.stats30d.utilization)} sub={summary.stats30d.isDemo ? "demo trips" : undefined} tone="brand" />
            <Stat label="Profit (30 d)" value={usd(summary.stats30d.profit)} />
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-2.5 font-medium">Truck</th>
                      <th className="px-3 py-2.5 font-medium">Driver</th>
                      <th className="px-3 py-2.5 font-medium">Location</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Current load</th>
                      <th className="px-3 py-2.5 font-medium">Next available</th>
                      <th className="px-3 py-2.5 text-right font-medium">Fuel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trucks.map((t) => {
                      const trip = t.trips[0];
                      return (
                        <tr key={t.id} className="relative transition-colors hover:bg-surface-2/70">
                          <td className="px-4 py-3">
                            <Link href={`/app/fleet/${t.id}`} className="font-semibold after:absolute after:inset-0">{t.code}</Link>
                            <div className="text-xs text-muted">{(t.capacityKg / 1000).toFixed(0)} t · {label(t.bodyType)} · {t.volumeM3} m³</div>
                          </td>
                          <td className="px-3 py-3">{t.driver?.name ?? <span className="text-subtle">Unassigned</span>}</td>
                          <td className="px-3 py-3">{getCity(t.currentCityId)?.name}</td>
                          <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                          <td className="px-3 py-3">{trip ? `${getCity(trip.originCityId)?.name} → ${getCity(trip.destCityId)?.name}` : <span className="text-subtle">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-3">{t.availableFrom <= new Date() && t.status === "AVAILABLE" ? <span className="text-pos">Now</span> : dateTime(t.availableFrom)}</td>
                          <td className="num px-3 py-3 text-right">{t.fuelLPer100km} L</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {trucks.map((t) => (
                <Link key={t.id} href={`/app/fleet/${t.id}`} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.code}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-1 text-sm text-muted">{(t.capacityKg / 1000).toFixed(0)} t {label(t.bodyType).toLowerCase()} · {getCity(t.currentCityId)?.name}</div>
                  <div className="mt-1 text-xs text-subtle">{t.driver?.name ?? "No driver"}</div>
                </Link>
              ))}
            </div>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Fleet map</h2>
                {s.org.isDemo && <DemoBadge />}
              </div>
              <div className="h-80 xl:h-[420px]">
                <FleetMap trucks={trucks.map((t) => ({ id: t.id, code: t.code, city: t.trips[0] && t.status !== "AVAILABLE" ? t.trips[0].destCityId : t.currentCityId, from: t.trips[0]?.originCityId, status: t.status }))} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
