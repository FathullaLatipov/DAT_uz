"use client";

import { useMemo } from "react";
import { getCity } from "@/server/domain/geo";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";

export function FleetMap({ trucks }: { trucks: { id: string; code: string; city: string; from?: string; status: string }[] }) {
  const { points, routes } = useMemo(() => {
    const points: MapPoint[] = [];
    const routes: MapRoute[] = [];
    trucks.forEach((t, i) => {
      const c = getCity(t.city);
      if (!c) return;
      const j = i * 0.04;
      points.push({ id: t.id, lng: c.lng + j, lat: c.lat + j / 2, kind: "truck", label: t.code, sub: `${t.status.replace("_", " ").toLowerCase()} · ${c.name}`, href: `/app/fleet/${t.id}` });
      const f = t.from && getCity(t.from);
      if (f && t.status !== "AVAILABLE") routes.push({ id: t.id, from: [f.lng, f.lat], to: [c.lng, c.lat], highlight: true });
    });
    return { points, routes };
  }, [trucks]);
  return <LazyMap points={points} routes={routes} className="h-full w-full" />;
}
