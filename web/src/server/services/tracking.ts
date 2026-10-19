import { AVG_KM_PER_DAY, getCity, roadKmFromPoint } from "../domain/geo";

/** A GPS fix older than this is "last known", not "now". */
export const LIVE_FRESH_MS = 15 * 60_000;

export interface TrackPoint { lat: number; lng: number; at: Date }

export interface TripForTracking {
  status: string;
  originCityId: string;
  destCityId: string;
  startedAt: Date;
  etaAt: Date | null;
  loadedKm: number;
}

export interface TruckCost { fuelLPer100km: number; fuelPriceUsd: number }

export interface TripProgress {
  /** Where the truck is: the last GPS fix, or — with no fix — a point on the straight line origin→destination from elapsed time. */
  current: { lat: number; lng: number };
  /** True when `current` is computed from time, not reported by a phone. */
  estimated: boolean;
  /** True when the last real fix is old. */
  stale: boolean;
  updatedAt: Date | null;
  progress: number; // 0..1 of the loaded leg
  traveledKm: number;
  remainingKm: number;
  etaAt: Date;
  /** Diesel for the loaded leg: used so far and expected in total. Carrier-only information. */
  fuel: { usedL: number; totalL: number; usedUsd: number; totalUsd: number };
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * How far along a trip is. With GPS: remaining road distance from the last fix to the destination decides the
 * progress. Without: the share of the planned time that has passed, placed on the line between the two cities.
 * Fuel follows the truck's own cost profile, on the loaded leg.
 */
export function tripProgress(trip: TripForTracking, points: TrackPoint[], cost: TruckCost, now = new Date()): TripProgress {
  const o = getCity(trip.originCityId);
  const d = getCity(trip.destCityId);
  if (!o || !d) throw new Error("Unknown trip cities");
  const last = points.length ? points[points.length - 1] : null;
  const total = Math.max(1, trip.loadedKm);

  let current: { lat: number; lng: number };
  let progress: number;
  let remainingKm: number;
  if (trip.status === "COMPLETED") {
    current = { lat: d.lat, lng: d.lng };
    progress = 1;
    remainingKm = 0;
  } else if (last) {
    current = { lat: last.lat, lng: last.lng };
    remainingKm = Math.min(total, roadKmFromPoint(last.lat, last.lng, trip.destCityId));
    progress = clamp(1 - remainingKm / total);
  } else {
    const planned = trip.etaAt ? Math.max(1, trip.etaAt.getTime() - trip.startedAt.getTime()) : (total / AVG_KM_PER_DAY) * 86_400_000;
    progress = trip.status === "IN_TRANSIT" ? clamp((now.getTime() - trip.startedAt.getTime()) / planned) : 0;
    current = { lat: o.lat + (d.lat - o.lat) * progress, lng: o.lng + (d.lng - o.lng) * progress };
    remainingKm = Math.round(total * (1 - progress));
  }
  const traveledKm = Math.round(total * progress);
  const eta = trip.status === "COMPLETED" ? (trip.etaAt ?? now) : new Date(now.getTime() + (remainingKm / AVG_KM_PER_DAY) * 86_400_000);
  const usedL = (traveledKm * cost.fuelLPer100km) / 100;
  const totalL = (total * cost.fuelLPer100km) / 100;
  return {
    current,
    estimated: !last && trip.status !== "COMPLETED",
    stale: !!last && now.getTime() - last.at.getTime() > LIVE_FRESH_MS,
    updatedAt: last?.at ?? null,
    progress,
    traveledKm,
    remainingKm: Math.round(remainingKm),
    etaAt: eta,
    fuel: { usedL: Math.round(usedL), totalL: Math.round(totalL), usedUsd: Math.round(usedL * cost.fuelPriceUsd), totalUsd: Math.round(totalL * cost.fuelPriceUsd) },
  };
}

/** Keeps a long track light for the map: at most `max` points, always including the first and the last. */
export function thin<T>(items: T[], max = 120): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}
