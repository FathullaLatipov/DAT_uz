"use client";

import { getCity, roadKmFromPoint } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { useSavedPosition } from "./near-me";
import { useTruckRoute } from "./use-truck-route";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";

/** Truck → (empty) → pickup → (loaded) → delivery. */
export function RouteMap({ origin, dest, truckCity, truckCode, truckPos, className, onDemand, offerId, truckId }: { origin: string; dest: string; offerId?: string; truckId?: string | null; truckCity?: string; truckCode?: string; truckPos?: { lat: number; lng: number } | null; className?: string; onDemand?: boolean }) {
  const { t: tr, city, km } = useI18n();
  const me = useSavedPosition();
  const road = useTruckRoute(offerId, truckId);
  const loadedPath = road?.loaded?.ok ? road.loaded.path : undefined;
  const emptyPath = road?.empty?.ok ? road.empty.path : undefined;
  const o = getCity(origin)!;
  const d = getCity(dest)!;
  const t = truckCity ? getCity(truckCity) : undefined;
  const points: MapPoint[] = [
    { id: "o", lng: o.lng, lat: o.lat, kind: "city", label: tr("map.pickup", { city: city(o.id) }), tone: "brand" },
    { id: "d", lng: d.lng, lat: d.lat, kind: "city", label: tr("map.delivery", { city: city(d.id) }), tone: "pos" },
  ];
  const routes: MapRoute[] = [{ id: "loaded", from: [o.lng, o.lat], to: [d.lng, d.lat], path: loadedPath, highlight: true }];
  const from = truckPos ?? (t && t.id !== o.id ? { lat: t.lat, lng: t.lng } : null);
  if (from && !(truckPos && roadKmFromPoint(truckPos.lat, truckPos.lng, o.id) === 0)) {
    points.push({ id: "t", lng: from.lng, lat: from.lat, kind: "truck", label: `${truckCode ?? tr("fleet.truck")} · ${city(t?.id ?? o.id)}${truckPos ? " · GPS" : ""}` });
    routes.push({ id: "empty", from: [from.lng, from.lat], to: [o.lng, o.lat], path: emptyPath, kind: "empty", highlight: true });
  }
  // Where the viewer is (remembered from "Near me"), with the drive to the pickup when no truck is shown.
  if (me) {
    const dist = roadKmFromPoint(me.lat, me.lng, o.id);
    points.push({ id: "me", lng: me.lng, lat: me.lat, kind: "city", label: tr("map.you"), sub: dist > 0 ? tr("map.toPickup", { dist: km(dist) }) : undefined, tone: "warn" });
    if (!from && dist > 0) routes.push({ id: "me-empty", from: [me.lng, me.lat], to: [o.lng, o.lat], kind: "empty", highlight: true });
  }
  return <LazyMap points={points} routes={routes} className={className} fitPadding={56} onDemand={onDemand} />;
}
