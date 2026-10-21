import { AVG_KM_PER_DAY, GPS_FRESH_MS, estimateRoadKm, getCity, roadKmFromPoint } from "../domain/geo";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";
import { borderSummary } from "../domain/borders";
import { effectiveFuelPrice, type FuelTable } from "../domain/fuel";
import { checkFit, type CargoSize, type TruckPassport } from "../domain/fit";
import { computeProfit, estimateTollsUsd, type CostProfile, type ProfitBreakdown } from "./profitability";

/**
 * Load-matching engine. Deterministic and explainable: every score is a weighted sum of
 * named components, and each component carries the human sentence that justifies it.
 * The sentences are produced in the caller's language (ctx.i18n, English when absent) at the
 * moment they are built, so what the engine returns can be shown as-is.
 */

export interface MatchTruck extends CostProfile, TruckPassport {
  id: string;
  code: string;
  bodyType: string;
  capacityKg: number;
  volumeM3: number;
  currentCityId: string;
  availableFrom: Date;
  status: string;
  /** Drivers on board: 1, or 2 when the truck runs as a team. */
  crew?: number;
  /** Price diesel by the countries of the route (the platform table) rather than the truck's own fixed price. */
  fuelByCountry?: boolean;
  /** Phone GPS fix; used for deadhead only while fresh and the truck is not mid-trip. */
  lat?: number | null;
  lng?: number | null;
  positionAt?: Date | null;
}

export interface MatchOffer {
  id: string;
  originCityId: string;
  destCityId: string;
  originCountry: string;
  destCountry: string;
  loadingDate: Date;
  weightKg: number;
  volumeM3: number | null;
  bodyType: string;
  cargoType: string;
  distanceKm: number;
  rateUsd: number;
  paymentTerms: string | null;
  brokerId: string | null;
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  oversize?: boolean;
  adrClass?: string | null;
  /** JSON string[] as stored, or the parsed list. */
  requirements?: string | string[];
}

/** The requirements column holds a JSON array; anything else counts as none. */
function requirementList(r: string | string[] | undefined): string[] {
  if (Array.isArray(r)) return r;
  if (!r || r === "[]") return [];
  try { const v = JSON.parse(r); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

export interface MatchPreferences {
  minRatePerKmUsd: number | null;
  maxDeadheadKm: number;
  preferredCargo: string[];
  preferredCountries: string[];
  paymentTerms: string[];
  routes: { originCityId: string; destCityId: string | null; destCountry: string | null }[];
}

export interface MatchContext {
  prefs: MatchPreferences;
  benchmarks: Map<string, number>; // "origin>dest" → median $/km
  brokerScore: (brokerId: string | null) => number | null;
  outbound: Map<string, number>; // city → active outbound loads
  /** Diesel USD/L by country; when absent the truck's own fuel price is used. */
  fuel?: FuelTable;
  now?: Date;
  /** Language of the explanation text. English when omitted (tests, background jobs). */
  i18n?: I18n;
  /**
   * Numbers only: no explanation text is built (blockers/reasons/warnings come back as empty strings, so the
   * counts and `eligible` are right but the wording is not). Scoring thousands of pairs for a ranking is several
   * times cheaper this way; re-score the few rows that are shown without it.
   */
  lite?: boolean;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number;
  detail: string;
}

export interface MatchResult {
  truckId: string;
  offerId: string;
  score: number; // 0..100
  eligible: boolean;
  blockers: string[];
  components: ScoreComponent[];
  reasons: string[];
  warnings: string[];
  deadheadKm: number;
  readyAt: Date;
  benchmarkPerKm: number | null;
  profit: ProfitBreakdown;
}

const WEIGHTS = {
  truck: 0.15,
  route: 0.1,
  proximity: 0.15,
  date: 0.1,
  price: 0.2,
  deadhead: 0.1,
  demand: 0.05,
  broker: 0.1,
  prefs: 0.05,
} as const;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const DAY = 86_400_000;


/** Body-type compatibility: 100 exact, partial for interchangeable bodies, 0 = cannot carry. */
export function bodyCompatibility(truckBody: string, offerBody: string, cargo: string): number {
  if (truckBody === offerBody) return 100;
  if (offerBody === "REFRIGERATED") return 0;
  if (truckBody === "REFRIGERATED") return cargo === "PRODUCE" || cargo === "FOOD" ? 85 : 70; // reefer can run dry freight
  const pair = `${truckBody}>${offerBody}`;
  const table: Record<string, number> = {
    "CURTAINSIDER>BOX": 80,
    "BOX>CURTAINSIDER": 75,
    "CURTAINSIDER>OPEN": 70,
    "CURTAINSIDER>FLATBED": 55,
    "FLATBED>OPEN": 85,
    "OPEN>FLATBED": 85,
    "CURTAINSIDER>CONTAINER": 50,
  };
  return table[pair] ?? 0;
}

/** What `lite` scoring uses in place of the real translator: every text helper returns "" at no cost. */
const NOOP_I18N = { t: () => "", tn: () => "", label: () => "", city: () => "", usd: () => "", perKm: () => "" } as unknown as I18n;

export function scoreMatch(truck: MatchTruck, offer: MatchOffer, ctx: MatchContext): MatchResult {
  const i = ctx.lite ? NOOP_I18N : (ctx.i18n ?? englishI18n());
  const { t, tn, label, city, usd } = i;
  const now = ctx.now ?? new Date();
  const blockers: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];
  const comps: ScoreComponent[] = [];
  const add = (key: keyof typeof WEIGHTS, score: number, detail: string) =>
    comps.push({ key, label: t(`match.components.${key}`), score: Math.round(clamp(score)), weight: WEIGHTS[key], detail });
  const lc = (code: string) => label(code).toLowerCase();

  // ── Truck compatibility ───────────────────────────────
  const body = bodyCompatibility(truck.bodyType, offer.bodyType, offer.cargoType);
  const weightOk = offer.weightKg <= truck.capacityKg;
  const volumeOk = offer.volumeM3 == null || offer.volumeM3 <= truck.volumeM3 * 1.02;
  if (body === 0) blockers.push(t("match.blockerBody", { body: lc(offer.bodyType), truckBody: lc(truck.bodyType) }));
  if (!weightOk) blockers.push(t("match.blockerWeight", { cargo: (offer.weightKg / 1000).toFixed(1), cap: (truck.capacityKg / 1000).toFixed(1) }));
  if (!volumeOk) blockers.push(t("match.blockerVolume", { v: offer.volumeM3 ?? 0, cap: truck.volumeM3 }));
  // Size and dangerous-goods checks; unknown values never block (see domain/fit.ts).
  const cargo: CargoSize = { cargoLengthM: offer.cargoLengthM, cargoWidthM: offer.cargoWidthM, cargoHeightM: offer.cargoHeightM, oversize: offer.oversize, adrClass: offer.adrClass, requirements: requirementList(offer.requirements) };
  const fit = checkFit(truck, cargo);
  for (const b of fit.blockers) {
    if (b.code === "NEEDS_ADR") blockers.push(t("match.blockerAdr"));
    else blockers.push(t(b.code === "TOO_LONG" ? "match.blockerLong" : b.code === "TOO_WIDE" ? "match.blockerWide" : "match.blockerHigh", { cargo: b.cargo ?? 0, truck: b.truck ?? 0 }));
  }
  for (const w of fit.warnings) warnings.push(t(w.code === "OVERSIZE" ? "match.warnOversize" : "match.warnNoPassport"));
  if (truck.status === "MAINTENANCE" || truck.status === "OFFLINE") blockers.push(t("match.blockerStatus", { status: lc(truck.status) }));
  const fill = offer.weightKg / truck.capacityKg;
  add(
    "truck",
    weightOk && volumeOk && fit.blockers.length === 0 ? body : 0,
    body === 100
      ? t("match.truckExact", { body: lc(truck.bodyType), pct: Math.round(fill * 100) })
      : body > 0
        ? t("match.truckPartial", { truckBody: label(truck.bodyType), body: lc(offer.bodyType) })
        : t("match.truckNone"),
  );
  if (body === 100 && weightOk)
    reasons.push(t("match.reasonFits", { t: (offer.weightKg / 1000).toFixed(1), cargo: lc(offer.cargoType), cap: (truck.capacityKg / 1000).toFixed(0), body: lc(truck.bodyType) }));

  // ── Deadhead & proximity ─────────────────────────────
  const gpsFresh = truck.lat != null && truck.lng != null && !!truck.positionAt && now.getTime() - truck.positionAt.getTime() <= GPS_FRESH_MS;
  const deadheadKm = gpsFresh ? roadKmFromPoint(truck.lat!, truck.lng!, offer.originCityId) : estimateRoadKm(truck.currentCityId, offer.originCityId);
  const maxDh = Math.max(50, ctx.prefs.maxDeadheadKm);
  const proximity = deadheadKm <= 25 ? 100 : 100 * (1 - deadheadKm / (maxDh * 2));
  add("proximity", proximity, deadheadKm === 0 ? t("match.proximityHere", { city: city(offer.originCityId) }) : t("match.proximityKm", { km: deadheadKm, city: city(truck.currentCityId) }));
  if (deadheadKm === 0) reasons.push(t("match.reasonHere", { city: city(offer.originCityId) }));
  else if (deadheadKm <= maxDh) reasons.push(t("match.reasonNear", { km: deadheadKm }));
  else warnings.push(t("match.warnDeadhead", { km: deadheadKm, max: maxDh }));
  if (deadheadKm > Math.max(maxDh * 4, 800)) blockers.push(t("match.blockerPickup", { km: deadheadKm }));

  const emptyShare = deadheadKm / (deadheadKm + offer.distanceKm || 1);
  add("deadhead", 100 * (1 - emptyShare / 0.35), t("match.deadheadShare", { pct: Math.round(emptyShare * 100) }));

  // ── Date ─────────────────────────────────────────────
  const start = Math.max(truck.availableFrom.getTime(), now.getTime());
  const readyAt = new Date(start + (deadheadKm / AVG_KM_PER_DAY) * DAY);
  const lateH = (readyAt.getTime() - offer.loadingDate.getTime()) / 3_600_000;
  const idleDays = -lateH / 24;
  let dateScore: number;
  let dateDetail: string;
  if (lateH > 24) {
    dateScore = 0;
    dateDetail = t("match.dateLate", { h: Math.round(lateH) });
    blockers.push(t("match.blockerLate"));
  } else if (lateH > 6) {
    dateScore = 50;
    dateDetail = t("match.dateTight", { h: Math.round(lateH) });
    warnings.push(t("match.warnTight"));
  } else {
    dateScore = idleDays > 4 ? 60 : idleDays > 2 ? 80 : 100;
    dateDetail = idleDays < 1 ? t("match.dateReady") : tn("match.dateWaits", Math.round(idleDays));
  }
  add("date", dateScore, dateDetail);

  // ── Profitability & price ───────────────────────────
  const tolls = estimateTollsUsd(offer.distanceKm, offer.originCountry, offer.destCountry, borderSummary(offer.originCountry, offer.destCountry).feeUsd);
  const fuelPriceUsd = truck.fuelByCountry !== false && ctx.fuel
    ? effectiveFuelPrice({ truckCountry: getCity(truck.currentCityId)?.country, originCountry: offer.originCountry, destCountry: offer.destCountry, deadheadKm, loadedKm: offer.distanceKm, table: ctx.fuel, fallback: truck.fuelPriceUsd })
    : truck.fuelPriceUsd;
  const profit = computeProfit({ ...truck, fuelPriceUsd, revenueUsd: offer.rateUsd, loadedKm: offer.distanceKm, deadheadKm, tollsUsd: tolls });
  const perKm = offer.distanceKm > 0 ? offer.rateUsd / offer.distanceKm : 0;
  const benchmark = ctx.benchmarks.get(`${offer.originCityId}>${offer.destCityId}`) ?? null;
  if (offer.rateUsd <= 0) {
    add("price", 40, t("match.priceNone"));
    warnings.push(t("match.warnNoRate"));
  } else if (benchmark) {
    const ratio = perKm / benchmark;
    add("price", 55 + (ratio - 1) * 250, t("match.priceVsLane", { perKm: i.perKm(perKm), median: i.perKm(benchmark), sign: ratio >= 1 ? "+" : "", pct: Math.round((ratio - 1) * 100) }));
    if (ratio >= 1.03) reasons.push(t("match.reasonAbove", { perKm: i.perKm(perKm), pct: Math.round((ratio - 1) * 100), median: i.perKm(benchmark) }));
    else if (ratio < 0.92) warnings.push(t("match.warnBelow", { pct: Math.round((1 - ratio) * 100), median: i.perKm(benchmark) }));
  } else {
    add("price", 20 + profit.margin * 180, t("match.priceNoBench", { perKm: i.perKm(perKm), pct: Math.round(profit.margin * 100) }));
  }
  if (offer.rateUsd > 0 && profit.profit > 0) reasons.push(t("match.reasonProfit", { profit: usd(profit.profit), pct: Math.round(profit.margin * 100) }));
  if (offer.rateUsd > 0 && profit.profit <= 0) warnings.push(t("match.warnLoss", { loss: usd(-profit.profit) }));

  // ── Route preferences ────────────────────────────────
  const routes = ctx.prefs.routes;
  let route: [number, string] = [70, t("match.routeNone")];
  if (routes.length) {
    const exact = routes.find((r) => r.originCityId === offer.originCityId && r.destCityId === offer.destCityId);
    const country = routes.find((r) => r.originCityId === offer.originCityId && (r.destCountry === offer.destCountry || (!r.destCityId && !r.destCountry)));
    const reverse = routes.find((r) => r.destCityId === offer.originCityId && r.originCityId === offer.destCityId);
    if (exact) route = [100, t("match.routeExact")];
    else if (country) route = [85, t("match.routeCountry")];
    else if (reverse) route = [80, t("match.routeReverse")];
    else if (ctx.prefs.preferredCountries.includes(offer.destCountry)) route = [65, t("match.routePrefCountry")];
    else route = [35, t("match.routeOutside")];
    if (route[0] >= 80) reasons.push(t("match.reasonRoute", { from: city(offer.originCityId), to: city(offer.destCityId) }));
  }
  add("route", route[0], route[1]);

  // ── Destination demand (next-load potential) ─────────
  const out = ctx.outbound.get(offer.destCityId) ?? 0;
  add("demand", 25 + out * 8, tn("match.demandLoads", out, { city: city(offer.destCityId) }));
  if (out >= 5) reasons.push(t("match.reasonDemand", { n: out, city: city(offer.destCityId) }));

  // ── Broker ───────────────────────────────────────────
  const bs = ctx.brokerScore(offer.brokerId);
  add("broker", bs ?? 55, bs == null ? t("match.brokerNeutral") : t("match.brokerScore", { n: bs }));
  if (bs != null && bs >= 80) reasons.push(t("match.reasonBroker", { n: bs }));
  if (bs != null && bs < 55) warnings.push(t("match.warnBroker", { n: bs }));

  // ── User preferences ─────────────────────────────────
  let pref = 70;
  const prefNotes: string[] = [];
  if (ctx.prefs.minRatePerKmUsd && offer.rateUsd > 0) {
    if (perKm >= ctx.prefs.minRatePerKmUsd) {
      pref += 15;
      prefNotes.push(t("match.prefMinOk"));
    } else {
      pref -= 40;
      prefNotes.push(t("match.prefMinBad"));
      warnings.push(t("match.warnMin", { min: i.perKm(ctx.prefs.minRatePerKmUsd) }));
    }
  }
  if (ctx.prefs.preferredCargo.length) {
    const hit = ctx.prefs.preferredCargo.includes(offer.cargoType);
    pref += hit ? 15 : -10;
    if (hit) prefNotes.push(t("match.prefCargo"));
  }
  if (ctx.prefs.paymentTerms.length && offer.paymentTerms) {
    const hit = ctx.prefs.paymentTerms.includes(offer.paymentTerms);
    pref += hit ? 10 : -10;
    if (hit) prefNotes.push(t("match.prefPayment"));
  }
  add("prefs", pref, prefNotes.length ? prefNotes.join(", ") : t("match.prefNeutral"));

  const raw = comps.reduce((s, c) => s + c.score * c.weight, 0);
  const eligible = blockers.length === 0;
  const score = eligible ? Math.round(clamp(raw)) : Math.min(Math.round(raw), 35);

  return {
    truckId: truck.id,
    offerId: offer.id,
    score,
    eligible,
    blockers,
    components: comps,
    reasons,
    warnings,
    deadheadKm,
    readyAt,
    benchmarkPerKm: benchmark,
    profit,
  };
}

/** Best truck for an offer among the fleet (highest eligible score). */
export function bestTruckFor(trucks: MatchTruck[], offer: MatchOffer, ctx: MatchContext): MatchResult | null {
  let best: MatchResult | null = null;
  for (const t of trucks) {
    const r = scoreMatch(t, offer, ctx);
    if (!best || (r.eligible && !best.eligible) || (r.eligible === best.eligible && r.score > best.score)) best = r;
  }
  return best;
}
