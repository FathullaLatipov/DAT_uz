"use client";

import { getCity } from "@/server/domain/geo";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";

/** Truck → (empty) → pickup → (loaded) → delivery. */
export function RouteMap({ origin, dest, truckCity, truckCode, className, onDemand }: { origin: string; dest: string; truckCity?: string; truckCode?: string; className?: string; onDemand?: boolean }) {
  const o = getCity(origin)!;
  const d = getCity(dest)!;
  const t = truckCity ? getCity(truckCity) : undefined;
  const points: MapPoint[] = [
    { id: "o", lng: o.lng, lat: o.lat, kind: "city", label: `Pickup · ${o.name}`, tone: "brand" },
    { id: "d", lng: d.lng, lat: d.lat, kind: "city", label: `Delivery · ${d.name}`, tone: "pos" },
  ];
  const routes: MapRoute[] = [{ id: "loaded", from: [o.lng, o.lat], to: [d.lng, d.lat], highlight: true }];
  if (t && t.id !== o.id) {
    points.push({ id: "t", lng: t.lng, lat: t.lat, kind: "truck", label: `${truckCode ?? "Truck"} · ${t.name}` });
    routes.push({ id: "empty", from: [t.lng, t.lat], to: [o.lng, o.lat], kind: "empty", highlight: true });
  }
  return <LazyMap points={points} routes={routes} className={className} fitPadding={56} onDemand={onDemand} />;
}
