import { db } from "../db";
import { PLATFORM_SOURCE } from "../ingestion/pipeline";
import { thin, tripProgress, type TripProgress } from "./tracking";

export type TrackViewer = "carrier" | "owner";

export interface TrackView {
  viewer: TrackViewer;
  tripId: string;
  status: string;
  originCityId: string;
  destCityId: string;
  truckCode: string;
  startedAt: string;
  points: [number, number][]; // [lat, lng], oldest first
  current: { lat: number; lng: number };
  estimated: boolean;
  stale: boolean;
  updatedAt: string | null;
  progress: number;
  traveledKm: number;
  remainingKm: number;
  totalKm: number;
  etaAt: string;
  /** Only the carrier sees what the trip costs it. */
  fuel: TripProgress["fuel"] | null;
}

/**
 * The live picture of a trip for one company: the carrier that runs it sees everything (including diesel),
 * the company that posted the load sees where it is and when it arrives — never the carrier's costs. Anyone
 * else gets null. Positions exist only while the trip is on the road and after it.
 */
export async function loadTrack(tripId: string, orgId: string, now = new Date()): Promise<TrackView | null> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: { truck: { select: { code: true, fuelLPer100km: true, fuelPriceUsd: true } }, points: { orderBy: { at: "asc" }, take: 3000, select: { lat: true, lng: true, at: true } } },
  });
  if (!trip) return null;
  let viewer: TrackViewer | null = trip.orgId === orgId ? "carrier" : null;
  if (!viewer && trip.offerId) {
    const posted = await db.freightListing.findFirst({ where: { offerId: trip.offerId, sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${orgId}-` } }, select: { id: true } });
    if (posted) viewer = "owner";
  }
  if (!viewer) return null;

  const p = tripProgress(trip, trip.points, trip.truck, now);
  return {
    viewer,
    tripId: trip.id,
    status: trip.status,
    originCityId: trip.originCityId,
    destCityId: trip.destCityId,
    truckCode: trip.truck.code,
    startedAt: trip.startedAt.toISOString(),
    points: thin(trip.points, 120).map((x) => [x.lat, x.lng] as [number, number]),
    current: p.current,
    estimated: p.estimated,
    stale: p.stale,
    updatedAt: p.updatedAt?.toISOString() ?? null,
    progress: p.progress,
    traveledKm: p.traveledKm,
    remainingKm: p.remainingKm,
    totalKm: Math.round(trip.loadedKm),
    etaAt: p.etaAt.toISOString(),
    fuel: viewer === "carrier" ? p.fuel : null,
  };
}
