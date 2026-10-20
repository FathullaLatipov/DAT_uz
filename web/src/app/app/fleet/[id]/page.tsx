import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Repeat } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { truckDetail } from "@/server/services/fleet";
import { getMatchTrucks, recommendations } from "@/server/services/freight";
import { bestChains, findBackhaul } from "@/server/services/backhaul";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, DemoBadge, Stat } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/fleet/status-badge";
import { TruckForm } from "@/components/fleet/truck-form";
import { passportText } from "@/lib/truck-passport";
import { TruckPosition } from "@/components/fleet/truck-position";
import { TripActions } from "@/components/fleet/trip-actions";
import { TripTrackPanel } from "@/components/fleet/trip-track-panel";
import { loadTrack } from "@/server/services/tracking-data";
import { TripHistoryTable } from "@/components/fleet/trip-history-table";
import { KmStack, ProfitBars } from "@/components/charts/lazy";
import { RecRow } from "@/components/loads/recommendation";
import { RouteLabel } from "@/components/loads/parts";
import { pct } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("fleet.truck") };
}

export default async function TruckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ assigned?: string; delivered?: string }> }) {
  const s = await requireSession();
  if (s.role === "BROKER") redirect("/app/post");
  const { t: tr, tn, label, city, num, dateTime, usd } = await getI18n();
  const { id } = await params;
  const { assigned, delivered } = await searchParams;
  const d = await truckDetail(s.orgId, id);
  if (!d) notFound();
  const { truck: t, month, last60, weeks, activeTrip } = d;

  const matchTruck = (await getMatchTrucks(s.orgId, { includeBusy: true })).find((x) => x.id === t.id)!;
  const busy = !!activeTrip && t.status !== "AVAILABLE";
  const [recs, backhaul] = await Promise.all([
    !busy && !["MAINTENANCE", "OFFLINE"].includes(t.status) ? recommendations(s.orgId, 5, { truckId: t.id }) : Promise.resolve([]),
    busy && activeTrip ? findBackhaul(s.orgId, { ...matchTruck, status: "AVAILABLE" }, activeTrip.destCityId, activeTrip.etaAt ?? new Date(), 120, 4) : Promise.resolve(null),
  ]);
  const track = activeTrip?.status === "IN_TRANSIT" ? await loadTrack(activeTrip.id, s.orgId) : null;
  const chains = recs.length ? await bestChains(s.orgId, matchTruck, recs.map((r) => ({ offer: r.offer, match: r.match })), 2) : [];

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href="/app/fleet" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {tr("nav.fleet")}
      </Link>
      {delivered && (
        <div className="mb-4 animate-fade-up rounded-lg border border-pos/30 bg-pos-soft px-3 py-2.5 text-sm text-pos">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> {tr("fleet.deliveredBanner", { code: t.code, city: city(t.currentCityId) })}</div>
          <div className="mt-1 pl-6">{tr("fleet.rateNow")}</div>
        </div>
      )}
      {assigned && (
        <div className="mb-4 flex animate-fade-up items-center gap-2 rounded-lg border border-pos/30 bg-pos-soft px-3 py-2.5 text-sm text-pos">
          <CheckCircle2 className="h-4 w-4" /> {tr("fleet.assigned", { code: t.code })}
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{tr("fleet.truckTitle", { code: t.code })}</h1>
            <StatusBadge status={t.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {(t.capacityKg / 1000).toFixed(0)} {tr("units.tonnes")} · {label(t.bodyType)} · {t.volumeM3} {tr("units.cubicMetres")} · {label(t.truckType)} · {t.driver?.name ?? tr("fleet.noDriverAssigned")}
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div><div className="text-xs text-muted">{tr("fleet.current")}</div><div className="font-medium">{city(t.currentCityId)}</div></div>
          <div><div className="text-xs text-muted">{tr("fleet.nextAvailable")}</div><div className="font-medium">{busy || t.availableFrom > new Date() ? `${city(matchTruck.currentCityId)}, ${dateTime(matchTruck.availableFrom)}` : tr("fleet.now")}</div></div>
        </div>
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="mb-2 text-sm font-semibold">{tr("gps.title")}</div>
        <TruckPosition truckId={t.id} cityId={t.currentCityId} positionAt={t.positionAt?.toISOString() ?? null} canEdit={can(s, "truck:write")} />
      </Card>

      {activeTrip && (
        <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-xs text-muted">{tr("fleet.currentTrip", { status: label(activeTrip.status).toLowerCase() })}</div>
            <RouteLabel origin={activeTrip.originCityId} dest={activeTrip.destCityId} />
          </div>
          <div className="num flex gap-6 text-sm">
            <div><div className="text-xs text-muted">{tr("calc.revenue")}</div>{usd(activeTrip.revenueUsd)}</div>
            <div><div className="text-xs text-muted">{tr("fleet.eta")}</div>{activeTrip.etaAt ? dateTime(activeTrip.etaAt) : "—"}</div>
            {activeTrip.offerId && <Link href={`/app/loads/${activeTrip.offerId}`} className="self-end text-brand hover:underline">{tr("fleet.loadLink")}</Link>}
            {can(s, "trip:assign") && <TripActions tripId={activeTrip.id} truckId={t.id} status={activeTrip.status} destCityId={activeTrip.destCityId} />}
          </div>
        </Card>
      )}

      {track && activeTrip && (
        <Card className="mb-5 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">{tr("tt.title")}</h2>
          <TripTrackPanel initial={track} tripId={activeTrip.id} />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={tr("fleet.thisMonth")} action={month.isDemo || last60.isDemo ? <DemoBadge /> : undefined} />
            <div className="grid grid-cols-2 gap-5 px-4 pb-5 sm:grid-cols-4 sm:px-5">
              <Stat label={tr("fleet.trips")} value={month.trips} />
              <Stat label={tr("calc.revenue")} value={usd(month.revenue)} />
              <Stat label={tr("chart.profit")} value={usd(month.profit)} tone={month.profit >= 0 ? "pos" : "neg"} />
              <Stat label={tr("fleet.avgRateKm")} value={month.ratePerKm ? usd(month.ratePerKm, 2) : "—"} />
              <Stat label={tr("chart.loadedKm")} value={num(month.loadedKm)} />
              <Stat label={tr("dash.emptyKm")} value={num(month.emptyKm)} />
              <Stat label={tr("fleet.utilization")} value={pct(month.utilization)} tone="brand" />
              <Stat label={tr("fleet.profitKm60")} value={last60.profitPerKm ? usd(last60.profitPerKm, 2) : "—"} />
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={tr("fleet.profitWeek")} />
              <div className="px-3 pb-4">
                <ProfitBars data={weeks} />
              </div>
            </Card>
            <Card>
              <CardHeader title={tr("fleet.loadedVsEmpty")} />
              <div className="px-3 pb-4">
                <KmStack data={weeks} />
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title={tr("fleet.tripHistory")} />
            {t.trips.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">{tr("fleet.noTripsYet")}</p>
            ) : (
              <TripHistoryTable trips={t.trips} initialOpenId={delivered} />
            )}
          </Card>

          <Card>
            <CardHeader title={tr("fleet.profile")} />
            <div className="px-4 pb-5 sm:px-5">
              {can(s, "truck:write") ? (
                <TruckForm
                  id={t.id}
                  canDelete={can(s, "truck:delete")}
                  initial={{
                    code: t.code, plate: t.plate ?? "", truckType: t.truckType, bodyType: t.bodyType, capacityKg: t.capacityKg, volumeM3: t.volumeM3,
                    currentCityId: t.currentCityId, status: t.status, availableFrom: t.availableFrom.toISOString().slice(0, 16), driverName: t.driver?.name ?? "",
                    fuelLPer100km: t.fuelLPer100km, fuelPriceUsd: t.fuelPriceUsd, driverCostPerKm: t.driverCostPerKm, maintenancePerKm: t.maintenancePerKm, otherPerTripUsd: t.otherPerTripUsd, ...passportText(t),
                  }}
                />
              ) : (
                <p className="text-sm text-muted">{tr("fleet.readOnly")}</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {backhaul && (
            <Card className="overflow-hidden border-brand/30">
              <CardHeader title={tr("dash.returnLoads")} subtitle={tr("fleet.arrivesIn", { code: t.code, city: city(backhaul.arrivalCityId), when: dateTime(backhaul.arrivalAt) })} action={<Repeat className="h-4 w-4 text-brand" />} />
              {backhaul.options.length ? (
                <>
                  <p className="px-5 pb-2 text-sm text-muted">{tn("fleet.foundReturn", backhaul.totalFound)}</p>
                  <div className="divide-y divide-border border-t border-border">
                    {backhaul.options.map((b) => <RecRow key={b.offer.id} rec={{ offer: b.offer, match: b.match, truck: matchTruck }} />)}
                  </div>
                </>
              ) : (
                <p className="px-5 pb-5 text-sm text-muted">{tr("fleet.noReturn", { city: city(backhaul.arrivalCityId) })}</p>
              )}
            </Card>
          )}
          {!busy && (
            <Card className="overflow-hidden">
              <CardHeader title={tr("fleet.bestFor", { code: t.code })} action={<Link href={`/app/loads?truckId=${t.id}`} className="text-xs text-brand hover:underline">{tr("fleet.all")}</Link>} />
              {recs.length ? (
                <div className="divide-y divide-border border-t border-border">{recs.map((r) => <RecRow key={r.offer.id} rec={r} />)}</div>
              ) : (
                <p className="px-5 pb-5 text-sm text-muted">{["MAINTENANCE", "OFFLINE"].includes(t.status) ? tr("fleet.statusNotice", { status: label(t.status).toLowerCase() }) : tr("fleet.noLoadsNow")}</p>
              )}
            </Card>
          )}
          {chains.length > 0 && (
            <Card>
              <CardHeader title={tr("fleet.chaining")} subtitle={tr("fleet.chainingSub")} />
              <div className="space-y-3 px-4 pb-5 sm:px-5">
                {chains.map((c, i) => (
                  <div key={i} className="rounded-lg bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
                      {[c.legs[0].offer.originCityId, ...c.legs.map((l) => l.offer.destCityId)].map((cid, j, arr) => (
                        <span key={j} className="inline-flex items-center gap-1">{city(cid)}{j < arr.length - 1 && <span className="text-subtle">→</span>}</span>
                      ))}
                    </div>
                    <div className="num mt-1.5 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted">{tr("chart.profit")}</div><div className="font-semibold text-pos">{usd(c.totalProfit)}</div></div>
                      <div><div className="text-muted">{tr("fleet.perDay")}</div><div className="font-semibold">{usd(c.profitPerDay)}</div></div>
                      <div><div className="text-muted">{tr("chart.loadedKm")}</div><div className="font-semibold">{pct(c.utilization)}</div></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {c.legs.map((l, j) => <Link key={l.offer.id} href={`/app/loads/${l.offer.id}?truck=${t.id}`} className="text-brand hover:underline">{tr("fleet.leg", { n: j + 1 })}</Link>)}
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
