"use client";

import { useMemo } from "react";
import { getCity } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { useSavedPosition } from "./near-me";
import { LazyMap, type MapPoint, type MapRoute } from "../map/lazy-map";

export function BoardMap({ items, className }: { items: { id: string; o: string; d: string; rateUsd: number; score: number | null }[]; className?: string }) {
  const { t, city, usd } = useI18n();
  const me = useSavedPosition();
  const { points, routes } = useMemo(() => {
    const points: MapPoint[] = [];
    const routes: MapRoute[] = [];
    const lanes = new Set<string>();
    for (const it of items.slice(0, 600)) {
      const o = getCity(it.o);
      const d = getCity(it.d);
      if (!o || !d) continue;
      // Jitter so co-located pickups cluster and spread instead of stacking exactly.
      const j = (parseInt(it.id.slice(-4), 36) % 100) / 2500;
      points.push({
        id: it.id,
        lng: o.lng + j,
        lat: o.lat - j,
        kind: "load",
        label: `${city(o.id)} → ${city(d.id)}`,
        sub: `${usd(it.rateUsd)}${it.score != null ? ` · ${t("rec.matchPct", { n: it.score })}` : ""}`,
        href: `/app/loads/${it.id}`,
        tone: it.score == null ? "muted" : it.score >= 80 ? "pos" : it.score >= 60 ? "brand" : "warn",
      });
      const lane = `${it.o}>${it.d}`;
      if (!lanes.has(lane) && lanes.size < 60) {
        lanes.add(lane);
        routes.push({ id: lane, from: [o.lng, o.lat], to: [d.lng, d.lat] });
      }
    }
    if (me) points.push({ id: "me", lng: me.lng, lat: me.lat, kind: "city", label: t("map.you"), tone: "warn" });
    return { points, routes };
  }, [items, t, city, usd, me]);

  return <LazyMap points={points} routes={routes} className={className} />;
}
