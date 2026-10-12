"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CityStats } from "@/server/services/market";
import { getCity } from "@/server/domain/geo";
import { LazyMap, type MapPoint } from "../map/lazy-map";
import { Badge, Trend } from "../ui/primitives";
import { cn } from "@/lib/format";

const DEMAND: Record<string, { label: string; tone: "pos" | "brand" | "warn" | "neutral"; map: MapPoint["tone"] }> = {
  VERY_HIGH: { label: "Very high", tone: "pos", map: "pos" },
  HIGH: { label: "High", tone: "pos", map: "brand" },
  MEDIUM: { label: "Medium", tone: "brand", map: "warn" },
  LOW: { label: "Low", tone: "warn", map: "neg" },
  INSUFFICIENT: { label: "Insufficient data", tone: "neutral", map: "muted" },
};

export function CityExplorer({ cities }: { cities: CityStats[] }) {
  const ranked = useMemo(() => [...cities].sort((a, b) => b.outbound - a.outbound), [cities]);
  const [sel, setSel] = useState(ranked[0]?.cityId);
  const city = cities.find((c) => c.cityId === sel);
  const points = useMemo<MapPoint[]>(
    () => cities.map((c) => ({ id: c.cityId, lng: c.lng, lat: c.lat, kind: "city", label: c.name, sub: `${c.outbound} loads · ${c.trucks} trucks · demand ${DEMAND[c.demand].label.toLowerCase()}`, weight: c.outbound, tone: DEMAND[c.demand].map })),
    [cities],
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="h-[380px] sm:h-[460px]">
        <LazyMap points={points} mode="heat" onSelect={setSel} className="h-full w-full" fitPadding={30} />
      </div>
      <div className="border-t border-border lg:border-l lg:border-t-0">
        <div className="max-h-[200px] overflow-y-auto border-b border-border lg:max-h-[220px]">
          <table className="w-full text-sm">
            <tbody>
              {ranked.map((c) => (
                <tr key={c.cityId} className={cn("cursor-pointer transition-colors hover:bg-surface-2", sel === c.cityId && "bg-surface-2")} onClick={() => setSel(c.cityId)}>
                  <td className="px-4 py-1.5">
                    <button className="text-left" aria-pressed={sel === c.cityId}>{c.name}</button>
                  </td>
                  <td className="num px-2 py-1.5 text-right text-muted">{c.outbound}</td>
                  <td className="px-4 py-1.5 text-right"><Badge tone={DEMAND[c.demand].tone}>{DEMAND[c.demand].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {city && (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{city.name}</h3>
              <Badge tone={DEMAND[city.demand].tone}>{DEMAND[city.demand].label}</Badge>
            </div>
            <dl className="num mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Loads out</dt><dd className="font-semibold">{city.outbound}</dd></div>
              <div><dt className="text-xs text-muted">Loads in</dt><dd className="font-semibold">{city.inbound}</dd></div>
              <div><dt className="text-xs text-muted">Trucks available</dt><dd className="font-semibold">{city.trucks}</dd></div>
              <div><dt className="text-xs text-muted">Median out $/km</dt><dd className="font-semibold">{city.avgPerKm ? `$${city.avgPerKm.toFixed(2)}` : "—"}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted">7-day rate trend</dt><dd><Trend value={city.trendPct} /></dd></div>
            </dl>
            {city.topDestinations.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-muted">Top destinations</div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {city.topDestinations.map((d) => <li key={d.cityId} className="flex justify-between"><span>{getCity(d.cityId)?.name}</span><span className="num text-muted">{d.loads}</span></li>)}
                </ul>
              </div>
            )}
            <Link href={`/app/loads?origin=${city.cityId}&radiusKm=50`} className="mt-3 inline-block text-sm text-brand hover:underline">Loads from {city.name} →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
