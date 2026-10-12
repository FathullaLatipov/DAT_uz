import { AVG_KM_PER_DAY, estimateRoadKm, getCity } from "../domain/geo";
import { label } from "../domain/enums";
import { computeProfit, estimateTollsUsd, type CostProfile, type ProfitBreakdown } from "./profitability";

/**
 * Load-matching engine. Deterministic and explainable: every score is a weighted sum of
 * named components, and each component carries the human sentence that justifies it.
 */

export interface MatchTruck extends CostProfile {
  id: string;
  code: string;
  bodyType: string;
  capacityKg: number;
  volumeM3: number;
  currentCityId: string;
  availableFrom: Date;
  status: string;
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
  now?: Date;
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
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cityName = (id: string) => getCity(id)?.name ?? id;

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

export function scoreMatch(truck: MatchTruck, offer: MatchOffer, ctx: MatchContext): MatchResult {
  const now = ctx.now ?? new Date();
  const blockers: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];
  const comps: ScoreComponent[] = [];
  const add = (key: keyof typeof WEIGHTS, lbl: string, score: number, detail: string) =>
    comps.push({ key, label: lbl, score: Math.round(clamp(score)), weight: WEIGHTS[key], detail });

  // ── Truck compatibility ───────────────────────────────
  const body = bodyCompatibility(truck.bodyType, offer.bodyType, offer.cargoType);
  const weightOk = offer.weightKg <= truck.capacityKg;
  const volumeOk = offer.volumeM3 == null || offer.volumeM3 <= truck.volumeM3 * 1.02;
  if (body === 0) blockers.push(`Requires ${label(offer.bodyType).toLowerCase()} body — truck is ${label(truck.bodyType).toLowerCase()}`);
  if (!weightOk) blockers.push(`Cargo ${(offer.weightKg / 1000).toFixed(1)} t exceeds truck capacity ${(truck.capacityKg / 1000).toFixed(1)} t`);
  if (!volumeOk) blockers.push(`Cargo volume ${offer.volumeM3} m³ exceeds truck volume ${truck.volumeM3} m³`);
  if (truck.status === "MAINTENANCE" || truck.status === "OFFLINE") blockers.push(`Truck is ${label(truck.status).toLowerCase()}`);
  const fill = offer.weightKg / truck.capacityKg;
  add("truck", "Truck compatibility", weightOk && volumeOk ? body : 0,
    body === 100 ? `Matching ${label(truck.bodyType).toLowerCase()}, ${Math.round(fill * 100)}% of capacity used` : body > 0 ? `${label(truck.bodyType)} can carry a ${label(offer.bodyType).toLowerCase()} load` : "Body type incompatible");
  if (body === 100 && weightOk) reasons.push(`The cargo (${(offer.weightKg / 1000).toFixed(1)} t, ${label(offer.cargoType).toLowerCase()}) fits your ${(truck.capacityKg / 1000).toFixed(0)}-ton ${label(truck.bodyType).toLowerCase()}.`);

  // ── Deadhead & proximity ─────────────────────────────
  const deadheadKm = estimateRoadKm(truck.currentCityId, offer.originCityId);
  const maxDh = Math.max(50, ctx.prefs.maxDeadheadKm);
  const proximity = deadheadKm <= 25 ? 100 : 100 * (1 - deadheadKm / (maxDh * 2));
  add("proximity", "Location proximity", proximity,
    deadheadKm === 0 ? `Truck is already in ${cityName(offer.originCityId)}` : `${deadheadKm} km from ${cityName(truck.currentCityId)} to pickup`);
  if (deadheadKm === 0) reasons.push(`Your truck is already in ${cityName(offer.originCityId)} — no repositioning needed.`);
  else if (deadheadKm <= maxDh) reasons.push(`Your truck is ${deadheadKm} km from the loading point.`);
  else warnings.push(`Deadhead of ${deadheadKm} km exceeds your ${maxDh} km preference.`);
  if (deadheadKm > Math.max(maxDh * 4, 800)) blockers.push(`Pickup is ${deadheadKm} km away`);

  const emptyShare = deadheadKm / (deadheadKm + offer.distanceKm || 1);
  add("deadhead", "Deadhead", 100 * (1 - emptyShare / 0.35), `${Math.round(emptyShare * 100)}% of total driving would be empty`);

  // ── Date ─────────────────────────────────────────────
  const start = Math.max(truck.availableFrom.getTime(), now.getTime());
  const readyAt = new Date(start + (deadheadKm / AVG_KM_PER_DAY) * DAY);
  const lateH = (readyAt.getTime() - offer.loadingDate.getTime()) / 3_600_000;
  const idleDays = -lateH / 24;
  let dateScore: number;
  let dateDetail: string;
  if (lateH > 24) {
    dateScore = 0;
    dateDetail = `Truck can reach pickup ~${Math.round(lateH)} h after loading time`;
    blockers.push("Truck can't reach the pickup before the loading date");
  } else if (lateH > 6) {
    dateScore = 50;
    dateDetail = `Tight: arrives ~${Math.round(lateH)} h after the loading window opens`;
    warnings.push("Arrival at pickup is tight — confirm the loading window with the broker.");
  } else {
    dateScore = idleDays > 4 ? 60 : idleDays > 2 ? 80 : 100;
    dateDetail = idleDays < 1 ? "Truck is ready in time for loading" : `Truck waits ~${Math.round(idleDays)} day(s) before loading`;
  }
  add("date", "Date compatibility", dateScore, dateDetail);

  // ── Profitability & price ───────────────────────────
  const tolls = estimateTollsUsd(offer.distanceKm, offer.originCountry, offer.destCountry);
  const profit = computeProfit({ ...truck, revenueUsd: offer.rateUsd, loadedKm: offer.distanceKm, deadheadKm, tollsUsd: tolls });
  const perKm = offer.distanceKm > 0 ? offer.rateUsd / offer.distanceKm : 0;
  const benchmark = ctx.benchmarks.get(`${offer.originCityId}>${offer.destCityId}`) ?? null;
  if (offer.rateUsd <= 0) {
    add("price", "Price attractiveness", 40, "No rate published — negotiable");
    warnings.push("No rate published — profitability cannot be estimated until you negotiate.");
  } else if (benchmark) {
    const ratio = perKm / benchmark;
    add("price", "Price attractiveness", 55 + (ratio - 1) * 250,
      `$${perKm.toFixed(2)}/km vs lane median $${benchmark.toFixed(2)}/km (${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%)`);
    if (ratio >= 1.03) reasons.push(`This offer is $${perKm.toFixed(2)}/km — ${Math.round((ratio - 1) * 100)}% above the recent lane median of $${benchmark.toFixed(2)}/km.`);
    else if (ratio < 0.92) warnings.push(`Rate is ${Math.round((1 - ratio) * 100)}% below the lane median ($${benchmark.toFixed(2)}/km).`);
  } else {
    add("price", "Price attractiveness", 20 + profit.margin * 180, `$${perKm.toFixed(2)}/km — no lane benchmark yet, scored on estimated margin (${Math.round(profit.margin * 100)}%)`);
  }
  if (offer.rateUsd > 0 && profit.profit > 0) reasons.push(`Estimated profit ${money(profit.profit)} (${Math.round(profit.margin * 100)}% margin) after fuel, driver, maintenance and tolls.`);
  if (offer.rateUsd > 0 && profit.profit <= 0) warnings.push(`Estimated loss of ${money(-profit.profit)} with your truck's cost profile.`);

  // ── Route preferences ────────────────────────────────
  const routes = ctx.prefs.routes;
  let route: [number, string] = [70, "No preferred routes set"];
  if (routes.length) {
    const exact = routes.find((r) => r.originCityId === offer.originCityId && r.destCityId === offer.destCityId);
    const country = routes.find((r) => r.originCityId === offer.originCityId && (r.destCountry === offer.destCountry || (!r.destCityId && !r.destCountry)));
    const reverse = routes.find((r) => r.destCityId === offer.originCityId && r.originCityId === offer.destCityId);
    if (exact) route = [100, "One of your preferred routes"];
    else if (country) route = [85, "Preferred origin and destination country"];
    else if (reverse) route = [80, "Return leg of a preferred route"];
    else if (ctx.prefs.preferredCountries.includes(offer.destCountry)) route = [65, "Destination in a preferred country"];
    else route = [35, "Outside your preferred routes"];
    if (route[0] >= 80) reasons.push(`${cityName(offer.originCityId)} → ${cityName(offer.destCityId)} matches your preferred routes.`);
  }
  add("route", "Route compatibility", route[0], route[1]);

  // ── Destination demand (next-load potential) ─────────
  const out = ctx.outbound.get(offer.destCityId) ?? 0;
  add("demand", "Market demand at destination", 25 + out * 8, `${out} active load${out === 1 ? "" : "s"} leaving ${cityName(offer.destCityId)}`);
  if (out >= 5) reasons.push(`${out} loads are currently leaving ${cityName(offer.destCityId)} — good chances for a return load.`);

  // ── Broker ───────────────────────────────────────────
  const bs = ctx.brokerScore(offer.brokerId);
  add("broker", "Broker reliability", bs ?? 55, bs == null ? "Insufficient broker history — neutral" : `Reliability ${bs}/100 from platform reviews`);
  if (bs != null && bs >= 80) reasons.push(`The broker has a strong track record on the platform (${bs}/100).`);
  if (bs != null && bs < 55) warnings.push(`Broker reliability is low (${bs}/100).`);

  // ── User preferences ─────────────────────────────────
  let pref = 70;
  const prefNotes: string[] = [];
  if (ctx.prefs.minRatePerKmUsd && offer.rateUsd > 0) {
    if (perKm >= ctx.prefs.minRatePerKmUsd) {
      pref += 15;
      prefNotes.push("meets minimum rate");
    } else {
      pref -= 40;
      prefNotes.push("below minimum rate");
      warnings.push(`Below your minimum of $${ctx.prefs.minRatePerKmUsd.toFixed(2)}/km.`);
    }
  }
  if (ctx.prefs.preferredCargo.length) {
    const hit = ctx.prefs.preferredCargo.includes(offer.cargoType);
    pref += hit ? 15 : -10;
    if (hit) prefNotes.push("preferred cargo");
  }
  if (ctx.prefs.paymentTerms.length && offer.paymentTerms) {
    const hit = ctx.prefs.paymentTerms.includes(offer.paymentTerms);
    pref += hit ? 10 : -10;
    if (hit) prefNotes.push("preferred payment terms");
  }
  add("prefs", "Your preferences", pref, prefNotes.length ? prefNotes.join(", ") : "Neutral");

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
