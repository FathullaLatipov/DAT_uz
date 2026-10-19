"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Fuel, Navigation } from "lucide-react";
import { getCity } from "@/server/domain/geo";
import type { TrackView } from "@/server/services/tracking-data";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";
import { LiveShare } from "./live-share";

const POLL_MS = 15_000;

/**
 * A trip on the road: the map with the planned line, the track driven and the truck, how far along it is, when it
 * arrives, and — for the carrier only — the diesel. Refreshes itself while the trip is on the road. `owner` is the
 * company that posted the load: it sees where the load is, not what the trip costs the carrier.
 */
export function TripTrackPanel({ initial, tripId, compactMap }: { initial: TrackView; tripId: string; compactMap?: boolean }) {
  const { t, city, dateTime, ago, num, usd, m } = useI18n();
  const [v, setV] = useState(initial);

  useEffect(() => {
    if (v.status !== "IN_TRANSIT") return;
    const id = setInterval(async () => {
      const next = await apiCall<TrackView>(`/api/trips/${tripId}/track`, "GET").catch(() => null);
      if (next) setV(next);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [tripId, v.status]);

  const { points, routes } = useMemo(() => {
    const o = getCity(v.originCityId)!;
    const d = getCity(v.destCityId)!;
    const pts: MapPoint[] = [
      { id: "o", lng: o.lng, lat: o.lat, kind: "city", label: city(o.id), tone: "brand" },
      { id: "d", lng: d.lng, lat: d.lat, kind: "city", label: city(d.id), tone: "pos" },
      { id: "t", lng: v.current.lng, lat: v.current.lat, kind: "truck", label: `${v.truckCode} · ${v.estimated ? t("tt.estimatedShort") : t("tt.liveShort")}`, sub: `${Math.round(v.progress * 100)}%` },
    ];
    // Driven: origin → each reported point → the truck. Still to go: truck → destination.
    const trail: [number, number][] = [[o.lng, o.lat], ...v.points.map(([lat, lng]) => [lng, lat] as [number, number]), [v.current.lng, v.current.lat]];
    const rts: MapRoute[] = trail.slice(1).map((to, i) => ({ id: `s${i}`, from: trail[i], to, kind: "loaded", highlight: true }));
    rts.push({ id: "rest", from: [v.current.lng, v.current.lat], to: [d.lng, d.lat], kind: "empty", highlight: true });
    return { points: pts, routes: rts };
  }, [v, city, t]);

  const pct = Math.round(v.progress * 100);
  const done = v.status === "COMPLETED";

  return (
    <div className="space-y-3">
      <div className="h-64 overflow-hidden rounded-xl border border-border sm:h-72">
        <LazyMap points={points} routes={routes} className="h-full w-full" fitPadding={56} onDemand={compactMap} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{done ? t("tt.delivered") : t("tt.progress", { pct })}</span>
          <span className="num text-muted">{num(v.traveledKm)} {m.units.km} {t("tt.driven")} · {num(v.remainingKm)} {m.units.km} {t("tt.toGo")}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2 text-muted"><Clock className="h-4 w-4 shrink-0" /> <span>{t("tt.eta")}: <span className="font-medium text-fg">{dateTime(v.etaAt)}</span></span></div>
        <div className="flex items-center gap-2 text-muted">
          <Navigation className="h-4 w-4 shrink-0" />
          <span>{v.updatedAt ? (v.stale ? t("tt.stale", { ago: ago(v.updatedAt) }) : t("tt.live", { ago: ago(v.updatedAt) })) : done ? "" : t("tt.estimated")}</span>
        </div>
        {v.fuel && (
          <div className="flex items-center gap-2 text-muted sm:col-span-2">
            <Fuel className="h-4 w-4 shrink-0" />
            <span>{t("tt.fuelTitle")}: <span className="font-medium text-fg">{t("tt.fuelValue", { used: num(v.fuel.usedL), total: num(v.fuel.totalL), usedUsd: usd(v.fuel.usedUsd), totalUsd: usd(v.fuel.totalUsd) })}</span></span>
          </div>
        )}
      </div>

      {v.viewer === "carrier" && v.status === "IN_TRANSIT" && <LiveShare tripId={tripId} />}
    </div>
  );
}
