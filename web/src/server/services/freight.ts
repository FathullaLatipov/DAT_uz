import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { db, parseJson } from "../db";
import { CITIES, getCity, haversineKm } from "../domain/geo";
import { brokerScores } from "./broker";
import { laneBenchmarks, outboundCounts } from "./market";
import { bestTruckFor, scoreMatch, type MatchContext, type MatchOffer, type MatchResult, type MatchTruck } from "./matching";
import type { LoadFilters } from "./filters";
import { demoOfferFilter } from "../domain/demo";
import { gradeAtLeast, gradeOffer, type GradeResult } from "./grade";
import type { I18n } from "../../i18n/create";

/**
 * The visitor's language for explanation text. Dynamic import: `getI18n` is server-only and needs a request,
 * so tests, scripts and anything without one fall back to English (undefined).
 */
async function requestI18n(): Promise<I18n | undefined> {
  try {
    const { getI18n } = await import("../../i18n/server");
    return await getI18n();
  } catch {
    return undefined;
  }
}

export async function getMatchContext(orgId: string): Promise<MatchContext> {
  const [pref, routes, benchmarks, brokers, outbound, i18n] = await Promise.all([
    db.orgPreference.findUnique({ where: { orgId } }),
    db.preferredRoute.findMany({ where: { orgId } }),
    laneBenchmarks(),
    brokerScores(),
    outboundCounts(),
    requestI18n(),
  ]);
  return {
    prefs: {
      minRatePerKmUsd: pref?.minRatePerKmUsd ?? null,
      maxDeadheadKm: pref?.maxDeadheadKm ?? 150,
      preferredCargo: parseJson(pref?.preferredCargo, []),
      preferredCountries: parseJson(pref?.preferredCountries, []),
      paymentTerms: parseJson(pref?.paymentTerms, []),
      routes: routes.map((r) => ({ originCityId: r.originCityId, destCityId: r.destCityId, destCountry: r.destCountry })),
    },
    benchmarks,
    brokerScore: (id) => (id ? (brokers.get(id)?.score ?? null) : null),
    outbound,
    i18n,
  };
}

/**
 * Trucks as the matcher sees them: a truck that is in transit is "available" at its
 * destination from its ETA — that's what lets backhaul loads be found before arrival.
 */
export async function getMatchTrucks(orgId: string, opts?: { includeBusy?: boolean }): Promise<MatchTruck[]> {
  const trucks = await db.truck.findMany({
    where: { orgId },
    include: { trips: { where: { status: { in: ["PLANNED", "IN_TRANSIT"] } }, orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { code: "asc" },
  });
  return trucks
    .filter((t) => opts?.includeBusy || !["MAINTENANCE", "OFFLINE"].includes(t.status))
    .map((t) => {
      const trip = t.trips[0];
      const busy = trip && ["LOADING", "IN_TRANSIT", "UNLOADING"].includes(t.status);
      return {
        ...t,
        currentCityId: busy ? trip.destCityId : t.currentCityId,
        availableFrom: busy && trip.etaAt ? trip.etaAt : t.availableFrom,
        // A GPS fix says where the truck is now, not where it will be after its trip.
        ...(busy ? { lat: null, lng: null, positionAt: null } : {}),
      };
    });
}

export const toMatchOffer = (o: {
  id: string; originCityId: string; destCityId: string; originCountry: string; destCountry: string; loadingDate: Date;
  weightKg: number; volumeM3: number | null; bodyType: string; cargoType: string; distanceKm: number; rateUsd: number;
  paymentTerms: string | null; brokerId: string | null;
}): MatchOffer => o;

// originCity/destCity/broker are deliberately NOT joined here: every list/card component
// resolves city names from the static `getCity()` table (src/server/domain/geo.ts), not from
// the DB relation, and `.broker` is only read on the single-offer detail pages, which run their
// own separate `include` (`getOfferDetail` below, and `load/[id]/page.tsx`). Those 3 joins on
// every row of a list query (up to ~2000 for the load board, ~11k pre-fix for the dashboard)
// were pure waste — confirmed by grepping every consumer of `OfferWithRels` before removing them.
export const offerInclude = {
  listings: { select: { sourceId: true, lastSeenAt: true, contactPhone: true, source: { select: { name: true, isDemo: true, kind: true } } } },
  broker: { select: { verified: true } },
} satisfies Prisma.FreightOfferInclude;

export type OfferWithRels = Prisma.FreightOfferGetPayload<{ include: typeof offerInclude }>;

export interface LoadRow {
  offer: OfferWithRels;
  match: MatchResult | null;
  truckCode: string | null;
  sources: { id: string; name: string }[];
  flags: string[];
  grade: GradeResult;
  favorite: boolean;
}

function citiesWithin(cityId: string, radiusKm: number) {
  const c = getCity(cityId);
  if (!c) return [cityId];
  return CITIES.filter((x) => haversineKm(c, x) <= radiusKm).map((x) => x.id);
}

export function buildWhere(f: LoadFilters): Prisma.FreightOfferWhereInput {
  // `expiresAt` too, so a load that finished a minute ago never shows while the expiry job is between runs.
  const and: Prisma.FreightOfferWhereInput[] = [{ status: "ACTIVE" }, { expiresAt: { gt: new Date() } }, demoOfferFilter()];
  if (f.origin) and.push({ originCityId: { in: f.radiusKm ? citiesWithin(f.origin, f.radiusKm) : [f.origin] } });
  if (f.originCountry) and.push({ originCountry: f.originCountry });
  if (f.dest) and.push({ destCityId: { in: f.destRadiusKm ? citiesWithin(f.dest, f.destRadiusKm) : [f.dest] } });
  if (f.destCountry) and.push({ destCountry: f.destCountry });
  if (f.scope === "domestic") and.push({ originCountry: "UZ", destCountry: "UZ" });
  else if (f.scope === "export") and.push({ originCountry: "UZ", NOT: { destCountry: "UZ" } });
  else if (f.scope === "import") and.push({ NOT: { originCountry: "UZ" }, destCountry: "UZ" });
  else if (f.scope === "transit") and.push({ NOT: { originCountry: "UZ" } }, { NOT: { destCountry: "UZ" } });
  if (f.loadingFrom) and.push({ loadingDate: { gte: new Date(`${f.loadingFrom}T00:00:00Z`) } });
  if (f.loadingTo) and.push({ loadingDate: { lte: new Date(`${f.loadingTo}T23:59:59Z`) } });
  if (f.unloadingTo) and.push({ OR: [{ unloadingDate: null }, { unloadingDate: { lte: new Date(`${f.unloadingTo}T23:59:59Z`) } }] });
  if (f.cargo?.length) and.push({ cargoType: { in: f.cargo } });
  if (f.body?.length) and.push({ bodyType: { in: f.body } });
  if (f.weightMin != null) and.push({ weightKg: { gte: f.weightMin } });
  if (f.weightMax != null) and.push({ weightKg: { lte: f.weightMax } });
  if (f.volumeMin != null) and.push({ volumeM3: { gte: f.volumeMin } });
  if (f.rateMin != null) and.push({ rateUsd: { gte: f.rateMin } });
  if (f.currency) and.push({ currency: f.currency });
  if (f.payment?.length) and.push({ paymentTerms: { in: f.payment } });
  if (f.brokerId) and.push({ brokerId: f.brokerId });
  if (f.source) and.push({ listings: { some: { sourceId: f.source } } });
  if (f.verifiedOnly) and.push({ quality: "VERIFIED" });
  if (f.hasRate) and.push({ rateUsd: { gt: 0 } });
  if (f.distanceMin != null) and.push({ distanceKm: { gte: f.distanceMin } });
  if (f.distanceMax != null) and.push({ distanceKm: { lte: f.distanceMax } });
  return { AND: and };
}

export interface SearchResult {
  rows: LoadRow[];
  all: { id: string; o: string; d: string; rateUsd: number; score: number | null }[];
  total: number;
  page: number;
  pageSize: number;
  truckCount: number;
}

const lastSeenMs = (r: LoadRow) => Math.max(r.offer.lastSeenAt.getTime(), ...r.offer.listings.map((l) => l.lastSeenAt.getTime()));

export async function searchLoads(orgId: string, userId: string, f: LoadFilters, page = 1, pageSize = 25): Promise<SearchResult> {
  const [offers, ctx, allTrucks, favs] = await Promise.all([
    // Newest first: when a search matches more than the cap, the freshest postings are the ones kept.
    db.freightOffer.findMany({ where: buildWhere(f), include: offerInclude, orderBy: { createdAt: "desc" }, take: 2000 }),
    getMatchContext(orgId),
    getMatchTrucks(orgId),
    db.favorite.findMany({ where: { userId }, select: { offerId: true } }),
  ]);
  const trucks = f.truckId ? allTrucks.filter((t) => t.id === f.truckId) : allTrucks;
  const favSet = new Set(favs.map((x) => x.offerId));
  const codeById = new Map(trucks.map((t) => [t.id, t.code]));

  let rows: LoadRow[] = offers.map((o) => {
    const match = trucks.length ? bestTruckFor(trucks, toMatchOffer(o), ctx) : null;
    const srcMap = new Map(o.listings.map((l) => [l.sourceId, l.source.name]));
    return {
      offer: o,
      match,
      truckCode: match ? (codeById.get(match.truckId) ?? null) : null,
      sources: [...srcMap].map(([id, name]) => ({ id, name })),
      flags: parseJson<string[]>(o.qualityFlags, []),
      grade: gradeOffer({
        loadingDate: o.loadingDate, rateUsd: o.rateUsd, qualityFlags: parseJson<string[]>(o.qualityFlags, []), lastSeenAt: o.lastSeenAt,
        brokerId: o.brokerId, brokerVerified: o.broker?.verified, brokerScore: ctx.brokerScore(o.brokerId),
        cargoKnown: o.cargoType !== "GENERAL",
        listings: o.listings.map((l) => ({ sourceId: l.sourceId, sourceKind: l.source.kind, contactPhone: l.contactPhone, lastSeenAt: l.lastSeenAt })),
      }),
      favorite: favSet.has(o.id),
    };
  });

  if (f.ratePerKmMin != null) rows = rows.filter((r) => r.offer.rateUsd / r.offer.distanceKm >= f.ratePerKmMin!);
  if (f.minScore != null) rows = rows.filter((r) => r.match && r.match.eligible && r.match.score >= f.minScore!);
  if (f.minGrade) rows = rows.filter((r) => gradeAtLeast(r.grade.grade, f.minGrade!));
  if (f.freshHours != null) rows = rows.filter((r) => Date.now() - lastSeenMs(r) <= f.freshHours! * 3_600_000);
  if (f.maxDeadhead != null) rows = rows.filter((r) => r.match && r.match.deadheadKm <= f.maxDeadhead!);

  const sort = f.sort ?? (trucks.length ? "score" : "newest");
  const key: Record<string, (r: LoadRow) => number> = {
    score: (r) => (r.match ? (r.match.eligible ? 1000 : 0) + r.match.score : -1),
    rate: (r) => r.offer.rateUsd,
    ratePerKm: (r) => r.offer.rateUsd / r.offer.distanceKm,
    profit: (r) => r.match?.profit.profit ?? -1e9,
    loading: (r) => -r.offer.loadingDate.getTime(),
    grade: (r) => r.grade.score,
    newest: (r) => (r.offer.sourceCreatedAt ?? r.offer.createdAt).getTime(),
    distance: (r) => -r.offer.distanceKm,
    deadhead: (r) => -(r.match?.deadheadKm ?? 1e9),
  };
  rows.sort((a, b) => key[sort](b) - key[sort](a));

  const total = rows.length;
  const all = rows.map((r) => ({
    id: r.offer.id,
    o: r.offer.originCityId,
    d: r.offer.destCityId,
    rateUsd: r.offer.rateUsd,
    score: r.match?.eligible ? r.match.score : null,
  }));
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), all, total, page, pageSize, truckCount: trucks.length };
}

export async function getOfferDetail(orgId: string, userId: string, id: string) {
  const offer = await db.freightOffer.findUnique({
    where: { id },
    include: {
      originCity: true,
      destCity: true,
      broker: true,
      listings: { include: { source: true }, orderBy: { rateUsd: "desc" } },
    },
  });
  if (!offer) return null;
  const [ctx, trucks, fav] = await Promise.all([
    getMatchContext(orgId),
    getMatchTrucks(orgId),
    db.favorite.findUnique({ where: { userId_offerId: { userId, offerId: id } } }),
  ]);
  const matches = trucks
    .map((t) => ({ truck: t, match: scoreMatch(t, toMatchOffer(offer), ctx) }))
    .sort((a, b) => Number(b.match.eligible) - Number(a.match.eligible) || b.match.score - a.match.score);
  return { offer, matches, favorite: !!fav, flags: parseJson<string[]>(offer.qualityFlags, []) };
}

export interface Recommendation {
  offer: OfferWithRels;
  match: MatchResult;
  truck: MatchTruck;
}

const matchingOfferSelect = {
  id: true, originCityId: true, destCityId: true, originCountry: true, destCountry: true, loadingDate: true,
  weightKg: true, volumeM3: true, bodyType: true, cargoType: true, distanceKm: true, rateUsd: true,
  paymentTerms: true, brokerId: true, qualityFlags: true, sourceCreatedAt: true, createdAt: true,
} satisfies Prisma.FreightOfferSelect;
type MatchingOffer = Prisma.FreightOfferGetPayload<{ select: typeof matchingOfferSelect }>;

/**
 * The active-offer set that `recommendations()` and `opportunityCounts()` both scan — same
 * ~11k-row query, fetched twice per dashboard render before this. A `select` of just the ~14
 * scalar fields `scoreMatch` actually needs (instead of `include: offerInclude`, which joins
 * originCity/destCity/broker/listings+source onto every one of those ~11k rows) measured at
 * 6-17s against hosted Postgres, vs. ~3s for the same rows as plain scalars. The full relations
 * are only needed for the handful of offers actually shown, fetched separately below.
 *
 * This does NOT get an `unstable_cache` wrapper: the scalar rows alone still serialize to
 * ~5MB, over Next's hard 2MB-per-entry Data Cache limit — it would silently never hit (spent a
 * round of profiling confirming exactly that, via the "items over 2MB can not be cached" log
 * line). `cache()` (React's per-request memoization — no serialization) at least dedupes the
 * one DB round trip across recommendations+opportunityCounts within a single render; getting
 * this below the 2MB ceiling for real cross-request caching needs filtering the row count down
 * (e.g. by the org's truck locations, the way findBackhaul already scopes by city), which is a
 * further follow-up, not a safe one to rush.
 */
const activeOffersForMatching = cache((): Promise<MatchingOffer[]> =>
  db.freightOffer.findMany({ where: { status: "ACTIVE", ...demoOfferFilter() }, select: matchingOfferSelect }),
);

/** Top recommendations across the fleet: best eligible (truck, load) pairs, one load per truck slot. */
export async function recommendations(orgId: string, limit = 6, opts?: { truckId?: string; fromCityId?: string }): Promise<Recommendation[]> {
  const [allOffers, ctx, trucksAll] = await Promise.all([activeOffersForMatching(), getMatchContext(orgId), getMatchTrucks(orgId)]);
  const offers = allOffers.filter(
    (o) => o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE") && (!opts?.fromCityId || o.originCityId === opts.fromCityId),
  );
  const trucks = opts?.truckId ? trucksAll.filter((t) => t.id === opts.truckId) : trucksAll;
  const pairs: { offer: MatchingOffer; match: MatchResult; truck: MatchTruck }[] = [];
  for (const t of trucks)
    for (const o of offers) {
      const m = scoreMatch(t, toMatchOffer(o), ctx);
      if (m.eligible && m.score >= 55) pairs.push({ offer: o, match: m, truck: t });
    }
  pairs.sort((a, b) => b.match.score - a.match.score || b.match.profit.profit - a.match.profit.profit);
  // Diversify: avoid one truck or one load dominating the list.
  const usedOffers = new Set<string>();
  const perTruck = new Map<string, number>();
  const out: typeof pairs = [];
  const cap = opts?.truckId ? limit : 2;
  for (const p of pairs) {
    if (usedOffers.has(p.offer.id) || (perTruck.get(p.truck.id) ?? 0) >= cap) continue;
    out.push(p);
    usedOffers.add(p.offer.id);
    perTruck.set(p.truck.id, (perTruck.get(p.truck.id) ?? 0) + 1);
    if (out.length >= limit) break;
  }
  if (!out.length) return [];
  // Only the ≤`limit` winners need their full relations (origin/dest city, broker, sources).
  const full = await db.freightOffer.findMany({ where: { id: { in: out.map((p) => p.offer.id) } }, include: offerInclude });
  const byId = new Map(full.map((o) => [o.id, o]));
  return out.flatMap((p) => {
    const offer = byId.get(p.offer.id);
    return offer ? [{ offer, match: p.match, truck: p.truck }] : [];
  });
}

/** Count of active loads with at least one eligible truck, and of strong matches. */
export async function opportunityCounts(orgId: string) {
  const [offers, ctx, trucks] = await Promise.all([activeOffersForMatching(), getMatchContext(orgId), getMatchTrucks(orgId)]);
  let matching = 0;
  let strong = 0;
  const dayAgo = Date.now() - 86_400_000;
  const fresh = offers.filter((o) => (o.sourceCreatedAt ?? o.createdAt).getTime() >= dayAgo).length;
  for (const o of offers) {
    const m = trucks.length ? bestTruckFor(trucks, toMatchOffer(o), ctx) : null;
    if (m?.eligible && m.score >= 55) matching++;
    if (m?.eligible && m.score >= 80) strong++;
  }
  return { active: offers.length, fresh, matching, strong };
}
