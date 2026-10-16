"use client";

import { useMemo } from "react";
import { getCity } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";

export function FleetMap({ trucks }: { trucks: { id: string; code: string; city: string; from?: string; status: string; lat?: number | null; lng?: number | null }[] }) {
  const { label, city } = useI18n();
  const { points, routes } = useMemo(() => {
    const points: MapPoint[] = [];
    const routes: MapRoute[] = [];
    trucks.forEach((t, i) => {
      const c = getCity(t.city);
      if (!c) return;
      const gps = t.lat != null && t.lng != null;
      const j = gps ? 0 : i * 0.04; // a real fix is drawn where it is; city-level trucks are spread so they don't stack
      points.push({ id: t.id, lng: gps ? t.lng! : c.lng + j, lat: gps ? t.lat! : c.lat + j / 2, kind: "truck", label: t.code, sub: `${label(t.status).toLowerCase()} · ${city(c.id)}${gps ? " · GPS" : ""}`, href: `/app/fleet/${t.id}` });
      const f = t.from && getCity(t.from);
      if (f && t.status !== "AVAILABLE") routes.push({ id: t.id, from: [f.lng, f.lat], to: [c.lng, c.lat], highlight: true });
    });
    return { points, routes };
  }, [trucks, label, city]);
  return <LazyMap points={points} routes={routes} className="h-full w-full" />;
}
