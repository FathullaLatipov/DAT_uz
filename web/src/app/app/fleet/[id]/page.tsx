import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Repeat } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { truckDetail } from "@/server/services/fleet";
import { getMatchTrucks, recommendations } from "@/server/services/freight";
import { bestChains, findBackhaul } from "@/server/services/backhaul";
import { label } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";
import { Card, CardHeader, DemoBadge, Stat } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/fleet/status-badge";
import { TruckForm } from "@/components/fleet/truck-form";
import { TripHistoryTable } from "@/components/fleet/trip-history-table";
import { KmStack, ProfitBars } from "@/components/charts/lazy";
import { RecRow } from "@/components/loads/recommendation";
import { cityLabel, RouteLabel } from "@/components/loads/parts";
import { dateTime, pct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Truck" };

export default async function TruckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ assigned?: string }> }) {
  const s = await requireSession();
  if (s.role === "BROKER") redirect("/app/post");
  const { id } = await params;
  const { assigned } = await searchParams;
  const d = await truckDetail(s.orgId, id);
  if (!d) notFound();
  const { truck: t, month, last60, weeks, activeTrip } = d;

  const matchTruck = (await getMatchTrucks(s.orgId, { includeBusy: true })).find((x) => x.id === t.id)!;
  const busy = !!activeTrip && t.status !== "AVAILABLE";
  const [recs, backhaul] = await Promise.all([
    !busy && !["MAINTENANCE", "OFFLINE"].includes(t.status) ? recommendations(s.orgId, 5, { truckId: t.id }) : Promise.resolve([]),
    busy && activeTrip ? findBackhaul(s.orgId, { ...matchTruck, status: "AVAILABLE" }, activeTrip.destCityId, activeTrip.etaAt ?? new Date(), 120, 4) : Promise.resolve(null),
  ]);
  const chains = recs.length ? await bestChains(s.orgId, matchTruck, recs.map((r) => ({ offer: r.offer, match: r.match })), 2) : [];

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href="/app/fleet" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Fleet
      </Link>
      {assigned && (
        <div className="mb-4 flex animate-fade-up items-center gap-2 rounded-lg border border-pos/30 bg-pos-soft px-3 py-2.5 text-sm text-pos">
          <CheckCircle2 className="h-4 w-4" /> Load assigned to {t.code}. We&apos;ve started looking for its return load.
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Truck {t.code}</h1>
            <StatusBadge status={t.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {(t.capacityKg / 1000).toFixed(0)} t · {label(t.bodyType)} · {t.volumeM3} m³ · {label(t.truckType)} · {t.driver?.name ?? "no driver assigned"}
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div><div className="text-xs text-muted">Current</div><div className="font-medium">{t.currentCity.name}</div></div>
          <div><div className="text-xs text-muted">Next available</div><div className="font-medium">{busy || t.availableFrom > new Date() ? `${cityLabel(matchTruck.currentCityId)}, ${dateTime(matchTruck.availableFrom)}` : "Now"}</div></div>
        </div>
      </div>

      {activeTrip && (
        <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-xs text-muted">Current trip · {label(activeTrip.status).toLowerCase()}</div>
            <RouteLabel origin={activeTrip.originCityId} dest={activeTrip.destCityId} />
          </div>
          <div className="num flex gap-6 text-sm">
            <div><div className="text-xs text-muted">Revenue</div>{usd(activeTrip.revenueUsd)}</div>
            <div><div className="text-xs text-muted">ETA</div>{activeTrip.etaAt ? dateTime(activeTrip.etaAt) : "—"}</div>
            {activeTrip.offerId && <Link href={`/app/loads/${activeTrip.offerId}`} className="self-end text-brand hover:underline">Load →</Link>}
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="This month" action={month.isDemo || last60.isDemo ? <DemoBadge /> : undefined} />
            <div className="grid grid-cols-2 gap-5 px-4 pb-5 sm:grid-cols-4 sm:px-5">
              <Stat label="Trips" value={month.trips} />
              <Stat label="Revenue" value={usd(month.revenue)} />
              <Stat label="Profit" value={usd(month.profit)} tone={month.profit >= 0 ? "pos" : "neg"} />
              <Stat label="Avg rate/km" value={month.ratePerKm ? `$${month.ratePerKm.toFixed(2)}` : "—"} />
              <Stat label="Loaded km" value={month.loadedKm.toLocaleString("en-US")} />
              <Stat label="Empty km" value={month.emptyKm.toLocaleString("en-US")} />
              <Stat label="Utilization" value={pct(month.utilization)} tone="brand" />
              <Stat label="Profit/km (60 d)" value={last60.profitPerKm ? `$${last60.profitPerKm.toFixed(2)}` : "—"} />
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Profit per week" />
              <div className="px-3 pb-4">
                <ProfitBars data={weeks} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Loaded vs empty km" />
              <div className="px-3 pb-4">
                <KmStack data={weeks} />
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Trip history" />
            {t.trips.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No trips yet.</p>
            ) : (
              <TripHistoryTable trips={t.trips} />
            )}
          </Card>

          <Card>
            <CardHeader title="Truck profile & cost settings" />
            <div className="px-4 pb-5 sm:px-5">
              {can(s, "truck:write") ? (
                <TruckForm
                  id={t.id}
                  canDelete={can(s, "truck:delete")}
                  initial={{
                    code: t.code, plate: t.plate ?? "", truckType: t.truckType, bodyType: t.bodyType, capacityKg: t.capacityKg, volumeM3: t.volumeM3,
                    currentCityId: t.currentCityId, status: t.status, availableFrom: t.availableFrom.toISOString().slice(0, 16), driverName: t.driver?.name ?? "",
                    fuelLPer100km: t.fuelLPer100km, fuelPriceUsd: t.fuelPriceUsd, driverCostPerKm: t.driverCostPerKm, maintenancePerKm: t.maintenancePerKm, otherPerTripUsd: t.otherPerTripUsd,
                  }}
                />
              ) : (
                <p className="text-sm text-muted">Your role can view but not edit trucks.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {backhaul && (
            <Card className="overflow-hidden border-brand/30">
              <CardHeader title="Return loads" subtitle={`${t.code} arrives in ${cityLabel(backhaul.arrivalCityId)} ~${dateTime(backhaul.arrivalAt)}`} action={<Repeat className="h-4 w-4 text-brand" />} />
              {backhaul.options.length ? (
                <>
                  <p className="px-5 pb-2 text-sm text-muted">We found {backhaul.totalFound} return load{backhaul.totalFound === 1 ? "" : "s"}.</p>
                  <div className="divide-y divide-border border-t border-border">
                    {backhaul.options.map((b) => <RecRow key={b.offer.id} rec={{ offer: b.offer, match: b.match, truck: matchTruck }} />)}
                  </div>
                </>
              ) : (
                <p className="px-5 pb-5 text-sm text-muted">No eligible return loads near {cityLabel(backhaul.arrivalCityId)} yet. We check again with every source sync.</p>
              )}
            </Card>
          )}
          {!busy && (
            <Card className="overflow-hidden">
              <CardHeader title={`Best loads for ${t.code}`} action={<Link href={`/app/loads?truckId=${t.id}`} className="text-xs text-brand hover:underline">All</Link>} />
              {recs.length ? (
                <div className="divide-y divide-border border-t border-border">{recs.map((r) => <RecRow key={r.offer.id} rec={r} />)}</div>
              ) : (
                <p className="px-5 pb-5 text-sm text-muted">{["MAINTENANCE", "OFFLINE"].includes(t.status) ? `Truck is ${label(t.status).toLowerCase()} — set it to Available to get recommendations.` : "No eligible loads right now. Try widening your deadhead preference."}</p>
              )}
            </Card>
          )}
          {chains.length > 0 && (
            <Card>
              <CardHeader title="Route chaining" subtitle="Best load + return plans, ranked by profit per day" />
              <div className="space-y-3 px-4 pb-5 sm:px-5">
                {chains.map((c, i) => (
                  <div key={i} className="rounded-lg bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
                      {[c.legs[0].offer.originCityId, ...c.legs.map((l) => l.offer.destCityId)].map((cid, j, arr) => (
                        <span key={j} className="inline-flex items-center gap-1">{getCity(cid)?.name}{j < arr.length - 1 && <span className="text-subtle">→</span>}</span>
                      ))}
                    </div>
                    <div className="num mt-1.5 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted">Profit</div><div className="font-semibold text-pos">{usd(c.totalProfit)}</div></div>
                      <div><div className="text-muted">Per day</div><div className="font-semibold">{usd(c.profitPerDay)}</div></div>
                      <div><div className="text-muted">Loaded km</div><div className="font-semibold">{pct(c.utilization)}</div></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {c.legs.map((l, j) => <Link key={l.offer.id} href={`/app/loads/${l.offer.id}?truck=${t.id}`} className="text-brand hover:underline">Leg {j + 1} →</Link>)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
