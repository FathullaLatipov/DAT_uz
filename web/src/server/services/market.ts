import { unstable_cache, revalidateTag } from "next/cache";
import { db } from "../db";
import { clearMemos } from "../cache";
import { demoOfferFilter } from "../domain/demo";
import { CITIES, getCity } from "../domain/geo";

/**
 * Market intelligence computed from freight actually stored in the database.
 * Nothing here is invented: when a lane has too few observations we return
 * `sufficient: false` and the UI shows "Insufficient market data".
 */

export const MIN_SAMPLES = 5;
const DAY = 86_400_000;
const WINDOW_DAYS = 45;

type Obs = {
  id: string;
  o: string;
  d: string;
  oc: string;
  dc: string;
  perKm: number;
  rateUsd: number;
  at: number; // posted time
  active: boolean;
  isDemo: boolean;
};

export interface LaneStats {
  origin: string;
  dest: string;
  sufficient: boolean;
  samples: number;
  activeLoads: number;
  availableTrucks: number;
  demandSupply: number | null;
  current: number | null; // median $/km over last 7 days
  avg7: number | null;
  avg30: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  avgRateUsd: number | null;
  trendPct: number | null; // last 7d vs days 8–30
  history: { date: string; perKm: number | null; loads: number }[];
  isDemo: boolean;
}

// `obs`/`trucksByCity` are rebuilt from a near-full scan of FreightOffer (45-day window) plus
// a truck groupBy — cheap against a local SQLite file, but a real network round trip against a
// hosted Postgres, and this is on the critical path of the dashboard, load board and market
// pages alike. Cached via Next's Data Cache (durable across serverless instances, unlike a
// plain in-memory variable) and explicitly invalidated wherever a mutation can change it.
const MARKET_TAG = "market";

const loadCached = unstable_cache(
  async (): Promise<{ obs: Obs[]; trucksByCityEntries: [string, number][] }> => {
    const since = new Date(Date.now() - WINDOW_DAYS * DAY);
    const [offers, trucks] = await Promise.all([
      db.freightOffer.findMany({
        where: { OR: [{ sourceCreatedAt: { gte: since } }, { createdAt: { gte: since } }], rateUsd: { gt: 0 }, distanceKm: { gt: 0 }, ...demoOfferFilter() },
        select: { id: true, originCityId: true, destCityId: true, originCountry: true, destCountry: true, rateUsd: true, distanceKm: true, sourceCreatedAt: true, createdAt: true, status: true, qualityFlags: true, isDemo: true },
      }),
      db.truck.groupBy({ by: ["currentCityId"], where: { status: "AVAILABLE" }, _count: true }),
    ]);
    const obs: Obs[] = offers
      // Suspicious rates never feed market statistics.
      .filter((o) => !o.qualityFlags.includes("SUSPICIOUS_RATE"))
      .map((o) => ({
        id: o.id,
        o: o.originCityId,
        d: o.destCityId,
        oc: o.originCountry,
        dc: o.destCountry,
        perKm: o.rateUsd / o.distanceKm,
        rateUsd: o.rateUsd,
        at: (o.sourceCreatedAt ?? o.createdAt).getTime(),
        active: o.status === "ACTIVE",
        isDemo: o.isDemo,
      }));
    return { obs, trucksByCityEntries: trucks.map((t) => [t.currentCityId, t._count]) };
  },
  ["market-load"],
  { revalidate: 60, tags: [MARKET_TAG] },
);

async function load() {
  const { obs, trucksByCityEntries } = await loadCached();
  return { obs, trucksByCity: new Map(trucksByCityEntries) };
}

export function invalidateMarketCache() {
  clearMemos();
  revalidateTag(MARKET_TAG);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r3 = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 1000);

function statsFor(obs: Obs[], trucks: number, origin: string, dest: string): LaneStats {
  const now = Date.now();
  const last30 = obs.filter((o) => now - o.at <= 30 * DAY);
  const last7 = last30.filter((o) => now - o.at <= 7 * DAY);
  const prev = last30.filter((o) => now - o.at > 7 * DAY);
  const per = last30.map((o) => o.perKm);
  const sufficient = last30.length >= MIN_SAMPLES;
  const a7 = mean(last7.map((o) => o.perKm));
  const aPrev = mean(prev.map((o) => o.perKm));
  const activeLoads = obs.filter((o) => o.active).length;

  const history: LaneStats["history"] = [];
  for (let w = 5; w >= 0; w--) {
    const from = now - (w + 1) * 7 * DAY;
    const to = now - w * 7 * DAY;
    const bucket = obs.filter((o) => o.at > from && o.at <= to);
    history.push({ date: new Date(to).toISOString().slice(0, 10), perKm: r3(median(bucket.map((o) => o.perKm))), loads: bucket.length });
  }

  return {
    origin,
    dest,
    sufficient,
    samples: last30.length,
    activeLoads,
    availableTrucks: trucks,
    demandSupply: trucks > 0 ? Math.round((activeLoads / trucks) * 100) / 100 : null,
    current: sufficient ? r3(median(last7.map((o) => o.perKm)) ?? median(per)) : null,
    avg7: sufficient && last7.length >= 2 ? r3(a7) : null,
    avg30: sufficient ? r3(mean(per)) : null,
    min: sufficient ? r3(Math.min(...per)) : null,
    max: sufficient ? r3(Math.max(...per)) : null,
    median: sufficient ? r3(median(per)) : null,
    avgRateUsd: sufficient ? Math.round(mean(last30.map((o) => o.rateUsd))!) : null,
    trendPct: sufficient && a7 != null && aPrev != null && last7.length >= 2 && prev.length >= 3 ? Math.round(((a7 - aPrev) / aPrev) * 1000) / 10 : null,
    history,
    isDemo: obs.some((o) => o.isDemo),
  };
}

export async function laneStats(origin: string, dest: string): Promise<LaneStats> {
  const { obs, trucksByCity } = await load();
  return statsFor(obs.filter((o) => o.o === origin && o.d === dest), trucksByCity.get(origin) ?? 0, origin, dest);
}

/** Lane benchmark used by the matching engine (median $/km over 30 days), or null if thin. */
export async function laneBenchmarks(): Promise<Map<string, number>> {
  const { obs } = await load();
  const byLane = new Map<string, number[]>();
  const now = Date.now();
  for (const o of obs) {
    if (now - o.at > 30 * DAY) continue;
    const k = `${o.o}>${o.d}`;
    (byLane.get(k) ?? byLane.set(k, []).get(k)!).push(o.perKm);
  }
  const out = new Map<string, number>();
  for (const [k, xs] of byLane) if (xs.length >= MIN_SAMPLES) out.set(k, median(xs)!);
  return out;
}

export async function routeTable(): Promise<LaneStats[]> {
  const { obs, trucksByCity } = await load();
  const lanes = new Map<string, Obs[]>();
  for (const o of obs) {
    const k = `${o.o}>${o.d}`;
    (lanes.get(k) ?? lanes.set(k, []).get(k)!).push(o);
  }
  return [...lanes.entries()]
    .map(([k, xs]) => {
      const [o, d] = k.split(">");
      return statsFor(xs, trucksByCity.get(o) ?? 0, o, d);
    })
    .sort((a, b) => b.samples - a.samples);
}

export type DemandLevel = "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export interface CityStats {
  cityId: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  outbound: number; // active loads leaving
  inbound: number;
  trucks: number;
  avgPerKm: number | null;
  trendPct: number | null;
  demand: DemandLevel;
  topDestinations: { cityId: string; loads: number }[];
}

function demandLevel(outbound: number, trucks: number, samples: number): DemandLevel {
  if (samples < MIN_SAMPLES) return "INSUFFICIENT";
  const ratio = outbound / Math.max(1, trucks);
  if (ratio >= 6) return "VERY_HIGH";
  if (ratio >= 3) return "HIGH";
  if (ratio >= 1.2) return "MEDIUM";
  return "LOW";
}

export async function cityStats(country?: string): Promise<CityStats[]> {
  const { obs, trucksByCity } = await load();
  const now = Date.now();
  return CITIES.filter((c) => !country || c.country === country).map((c) => {
    const out = obs.filter((o) => o.o === c.id);
    const out30 = out.filter((o) => now - o.at <= 30 * DAY);
    const last7 = out30.filter((o) => now - o.at <= 7 * DAY).map((o) => o.perKm);
    const prev = out30.filter((o) => now - o.at > 7 * DAY).map((o) => o.perKm);
    const activeOut = out.filter((o) => o.active);
    const dests = new Map<string, number>();
    for (const o of activeOut) dests.set(o.d, (dests.get(o.d) ?? 0) + 1);
    const trucks = trucksByCity.get(c.id) ?? 0;
    const a7 = mean(last7);
    const ap = mean(prev);
    return {
      cityId: c.id,
      name: c.name,
      country: c.country,
      lat: c.lat,
      lng: c.lng,
      outbound: activeOut.length,
      inbound: obs.filter((o) => o.d === c.id && o.active).length,
      trucks,
      avgPerKm: out30.length >= MIN_SAMPLES ? r3(median(out30.map((o) => o.perKm))) : null,
      trendPct: out30.length >= MIN_SAMPLES && a7 && ap && last7.length >= 2 && prev.length >= 3 ? Math.round(((a7 - ap) / ap) * 1000) / 10 : null,
      demand: demandLevel(activeOut.length, trucks, out30.length),
      topDestinations: [...dests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cityId, loads]) => ({ cityId, loads })),
    };
  });
}

export interface MarketSummary {
  activeLoads: number;
  newToday: number;
  availableTrucks: number;
  avgPerKm: number | null;
  trendPct: number | null;
  demand: DemandLevel;
  loadsTrendPct: number | null;
  isDemo: boolean;
}

export async function marketSummary(): Promise<MarketSummary> {
  const { obs, trucksByCity } = await load();
  const now = Date.now();
  const active = obs.filter((o) => o.active);
  const last7 = obs.filter((o) => now - o.at <= 7 * DAY);
  const prev = obs.filter((o) => now - o.at > 7 * DAY && now - o.at <= 30 * DAY);
  const trucks = [...trucksByCity.values()].reduce((s, n) => s + n, 0);
  const a7 = mean(last7.map((o) => o.perKm));
  const ap = mean(prev.map((o) => o.perKm));
  // Weekly posting volume vs the average week of the prior 23 days.
  const prevWeekly = prev.length / (23 / 7);
  return {
    activeLoads: active.length,
    newToday: obs.filter((o) => now - o.at <= DAY).length,
    availableTrucks: trucks,
    avgPerKm: last7.length >= MIN_SAMPLES ? r3(median(last7.map((o) => o.perKm))) : null,
    trendPct: a7 && ap && last7.length >= MIN_SAMPLES ? Math.round(((a7 - ap) / ap) * 1000) / 10 : null,
    loadsTrendPct: prevWeekly >= MIN_SAMPLES ? Math.round(((last7.length - prevWeekly) / prevWeekly) * 1000) / 10 : null,
    demand: demandLevel(active.length, trucks, obs.length),
    isDemo: obs.some((o) => o.isDemo),
  };
}

/** Active outbound loads per city — used for "market demand at destination" (backhaul potential). */
export async function outboundCounts(): Promise<Map<string, number>> {
  const { obs } = await load();
  const m = new Map<string, number>();
  for (const o of obs) if (o.active) m.set(o.o, (m.get(o.o) ?? 0) + 1);
  return m;
}

export const cityName = (id: string) => getCity(id)?.name ?? id;
