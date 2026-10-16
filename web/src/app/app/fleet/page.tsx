import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { fleetSummary } from "@/server/services/fleet";
import { Card, DemoBadge, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/fleet/status-badge";
import { FleetMap } from "@/components/fleet/fleet-map";
import { pct } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.fleet") };
}

export default async function FleetPage() {
  const s = await requireSession();
  if (s.role === "BROKER") redirect("/app/post");
  const { t: tr, label, city, country, num, dateTime, usd } = await getI18n();
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
  const routeText = routes.map((r) => `${city(r.originCityId)} → ${r.destCityId ? city(r.destCityId) : country(r.destCountry ?? "")}`).join(" · ");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={tr("nav.fleet")}
        subtitle={routeText ? tr("fleet.preferredRoutes", { routes: routeText }) : tr("fleet.setPreferred")}
        actions={canWrite && <LinkButton href="/app/fleet/new"><Plus className="h-4 w-4" /> {tr("dash.addTruck")}</LinkButton>}
      />
      {trucks.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck className="h-5 w-5" />} title={tr("fleet.noTrucks")} body={tr("fleet.noTrucksBody")} actions={canWrite && <LinkButton href="/app/fleet/new">{tr("dash.addTruck")}</LinkButton>} />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
            <Stat label={tr("fleet.trucks")} value={summary.total} />
            <Stat label={tr("fleet.available")} value={summary.available} tone="pos" />
            <Stat label={tr("fleet.onRoute")} value={summary.onRoute} />
            <Stat label={tr("fleet.maintenance")} value={summary.maintenance} />
            <Stat label={tr("fleet.utilization30")} value={pct(summary.stats30d.utilization)} sub={summary.stats30d.isDemo ? tr("fleet.demoTrips") : undefined} tone="brand" />
            <Stat label={tr("fleet.profit30")} value={usd(summary.stats30d.profit)} />
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-2.5 font-medium">{tr("fleet.colTruck")}</th>
                      <th className="px-3 py-2.5 font-medium">{tr("calc.driver")}</th>
                      <th className="px-3 py-2.5 font-medium">{tr("fleet.colLocation")}</th>
                      <th className="px-3 py-2.5 font-medium">{tr("fleet.colStatus")}</th>
                      <th className="px-3 py-2.5 font-medium">{tr("fleet.colCurrentLoad")}</th>
                      <th className="px-3 py-2.5 font-medium">{tr("fleet.nextAvailable")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{tr("calc.fuel")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trucks.map((t) => {
                      const trip = t.trips[0];
                      return (
                        <tr key={t.id} className="relative transition-colors hover:bg-surface-2/70">
                          <td className="px-4 py-3">
                            <Link href={`/app/fleet/${t.id}`} className="font-semibold after:absolute after:inset-0">{t.code}</Link>
                            <div className="text-xs text-muted">{(t.capacityKg / 1000).toFixed(0)} {tr("units.tonnes")} · {label(t.bodyType)} · {t.volumeM3} {tr("units.cubicMetres")}</div>
                          </td>
                          <td className="px-3 py-3">{t.driver?.name ?? <span className="text-subtle">{tr("fleet.unassigned")}</span>}</td>
                          <td className="px-3 py-3">{city(t.currentCityId)}</td>
                          <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                          <td className="px-3 py-3">{trip ? `${city(trip.originCityId)} → ${city(trip.destCityId)}` : <span className="text-subtle">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-3">{t.availableFrom <= new Date() && t.status === "AVAILABLE" ? <span className="text-pos">{tr("fleet.now")}</span> : dateTime(t.availableFrom)}</td>
                          <td className="num px-3 py-3 text-right">{tr("fleet.fuelVal", { n: num(t.fuelLPer100km) })}</td>
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
                  <div className="mt-1 text-sm text-muted">{(t.capacityKg / 1000).toFixed(0)} {tr("units.tonnes")} {label(t.bodyType).toLowerCase()} · {city(t.currentCityId)}</div>
                  <div className="mt-1 text-xs text-subtle">{t.driver?.name ?? tr("fleet.noDriver")}</div>
                </Link>
              ))}
            </div>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{tr("fleet.map")}</h2>
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
