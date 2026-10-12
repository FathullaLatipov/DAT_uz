import { db } from "../db";
import { demoOfferFilter } from "../domain/demo";
import { CITIES, estimateTransitDays, getCity, haversineKm } from "../domain/geo";
import { getMatchContext, getMatchTrucks, toMatchOffer, type OfferWithRels } from "./freight";
import { scoreMatch, type MatchResult, type MatchTruck } from "./matching";

const DAY = 86_400_000;

export interface BackhaulOption {
  offer: OfferWithRels;
  match: MatchResult;
}

export interface BackhaulPlan {
  truck: MatchTruck;
  arrivalCityId: string;
  arrivalAt: Date;
  options: BackhaulOption[];
  totalFound: number;
}

const include = {
  originCity: true,
  destCity: true,
  broker: true,
  listings: { select: { sourceId: true, lastSeenAt: true, source: { select: { name: true, isDemo: true } } } },
} as const;

/**
 * Return / onward loads near the city where a truck will become free.
 * Searches within `radiusKm` of the arrival city, loading from arrival−12h to arrival+4 days.
 */
export async function findBackhaul(orgId: string, truck: MatchTruck, arrivalCityId: string, arrivalAt: Date, radiusKm = 120, limit = 5): Promise<BackhaulPlan> {
  const arrival = getCity(arrivalCityId);
  const nearby = arrival ? CITIES.filter((c) => haversineKm(arrival, c) <= radiusKm).map((c) => c.id) : [arrivalCityId];
  const [offers, ctx] = await Promise.all([
    db.freightOffer.findMany({
      where: {
        status: "ACTIVE",
        ...demoOfferFilter(),
        originCityId: { in: nearby },
        loadingDate: { gte: new Date(arrivalAt.getTime() - DAY / 2), lte: new Date(arrivalAt.getTime() + 4 * DAY) },
      },
      include,
    }),
    getMatchContext(orgId),
  ]);
  const positioned: MatchTruck = { ...truck, currentCityId: arrivalCityId, availableFrom: arrivalAt };
  const scored = offers
    .map((o) => ({ offer: o, match: scoreMatch(positioned, toMatchOffer(o), ctx) }))
    // Return loads must have a trusted, positive rate — an unpriced or implausibly cheap load isn't a recommendation.
    .filter((x) => x.match.eligible && x.offer.rateUsd > 0 && !x.offer.qualityFlags.includes("SUSPICIOUS_RATE"))
    .sort((a, b) => b.match.score - a.match.score || b.match.profit.profit - a.match.profit.profit);
  return { truck, arrivalCityId, arrivalAt, options: scored.slice(0, limit), totalFound: scored.length };
}

/** Backhaul plans for every truck that is currently on a trip. */
export async function fleetBackhaul(orgId: string) {
  const trucks = await getMatchTrucks(orgId, { includeBusy: true });
  const busy = await db.truck.findMany({
    where: { orgId, status: { in: ["LOADING", "IN_TRANSIT", "UNLOADING"] } },
    include: { trips: { where: { status: { in: ["PLANNED", "IN_TRANSIT"] } }, orderBy: { startedAt: "desc" }, take: 1 } },
  });
  const plans: BackhaulPlan[] = [];
  for (const b of busy) {
    const trip = b.trips[0];
    const t = trucks.find((x) => x.id === b.id);
    if (!trip || !t) continue;
    plans.push(await findBackhaul(orgId, t, trip.destCityId, trip.etaAt ?? new Date(Date.now() + DAY)));
  }
  return plans;
}

export interface ChainLeg {
  offer: OfferWithRels;
  match: MatchResult;
}
export interface RouteChain {
  legs: ChainLeg[];
  totalProfit: number;
  totalRevenue: number;
  loadedKm: number;
  emptyKm: number;
  days: number;
  profitPerDay: number;
  utilization: number;
}

/**
 * Route chaining: best 2-leg plans (load → backhaul) for a truck, ranked by profit per day.
 * Optimizes the trip as a whole rather than a single load.
 */
export async function bestChains(orgId: string, truck: MatchTruck, firstLegs: ChainLeg[], limit = 3): Promise<RouteChain[]> {
  const chains: RouteChain[] = [];
  for (const first of firstLegs.slice(0, 6)) {
    const transit = estimateTransitDays(first.offer.distanceKm);
    const arrive = new Date(Math.max(first.offer.loadingDate.getTime(), first.match.readyAt.getTime()) + transit * DAY);
    const plan = await findBackhaul(orgId, truck, first.offer.destCityId, arrive, 120, 3);
    const seconds: (ChainLeg | null)[] = plan.options.length ? plan.options : [null];
    for (const second of seconds) {
      const legs = second ? [first, second] : [first];
      const totalProfit = legs.reduce((s, l) => s + l.match.profit.profit, 0);
      const loadedKm = legs.reduce((s, l) => s + l.match.profit.loadedKm, 0);
      const emptyKm = legs.reduce((s, l) => s + l.match.profit.emptyKm, 0);
      const end = second ? second.offer.loadingDate.getTime() + estimateTransitDays(second.offer.distanceKm) * DAY : arrive.getTime();
      const days = Math.max(1, Math.round((end - Date.now()) / DAY));
      chains.push({
        legs,
        totalProfit: Math.round(totalProfit),
        totalRevenue: Math.round(legs.reduce((s, l) => s + l.offer.rateUsd, 0)),
        loadedKm,
        emptyKm,
        days,
        profitPerDay: Math.round(totalProfit / days),
        utilization: loadedKm / Math.max(1, loadedKm + emptyKm),
      });
    }
  }
  return chains.sort((a, b) => b.profitPerDay - a.profitPerDay).slice(0, limit);
}
