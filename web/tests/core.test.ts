import { test } from "node:test";
import assert from "node:assert/strict";
import { brokerKey, normalizeBodyType, normalizeCity, normalizeCountry, normalizeCurrency, normalizeListing, normalizeWeightKg } from "../src/server/ingestion/normalize";
import { findDuplicate, fingerprint } from "../src/server/ingestion/dedupe";
import { parseCsv } from "../src/server/ingestion/adapters/csv";
import { computeProfit } from "../src/server/services/profitability";
import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";
import { computeReliability } from "../src/server/services/broker";
import { parseQueryRules } from "../src/server/ai/nlsearch";

test("normalizes cities, countries, bodies, currencies and weights", () => {
  for (const s of ["Tashkent", "Ташкент", "Toshkent", "Tashkent, UZ", "г. Ташкент"]) assert.equal(normalizeCity(s), "tashkent");
  for (const s of ["Uzbekistan", "Узбекистан", "UZ"]) assert.equal(normalizeCountry(s), "UZ");
  for (const s of ["Tent", "Тент", "Curtainsider"]) assert.equal(normalizeBodyType(s), "CURTAINSIDER");
  assert.equal(normalizeBodyType("рефрижератор"), "REFRIGERATED");
  assert.equal(normalizeCurrency("сум"), "UZS");
  assert.equal(normalizeCurrency("руб"), "RUB");
  assert.equal(normalizeCurrency("₸"), "KZT");
  assert.equal(normalizeWeightKg("20 т"), 20000);
  assert.equal(normalizeWeightKg("20,5т"), 20500);
  assert.equal(normalizeWeightKg(20000, "kg"), 20000);
  assert.equal(normalizeWeightKg("—"), null);
  assert.equal(normalizeCity("Чирчик-2"), null);
});

test("broker identity survives legal forms and quoting", () => {
  assert.equal(brokerKey("ООО «Silk Way Logistics»"), brokerKey("Silk Way Logistics LLC"));
});

test("quality layer rejects broken rows and flags suspicious ones", () => {
  const base = { externalId: "1", origin: "Bukhara", destination: "Tashkent", loadingDate: new Date(Date.now() + 86_400_000), weight: "18 t", bodyType: "тент", broker: "X", raw: {} };
  assert.equal(normalizeListing({ ...base, destination: "" }).offer, null);
  assert.equal(normalizeListing({ ...base, weight: "—" }).offer, null);
  const cheap = normalizeListing({ ...base, rate: 95, currency: "USD" });
  assert.ok(cheap.issues.some((i) => i.code === "SUSPICIOUS_RATE"));
  assert.equal(cheap.quality, "UNVERIFIED");
  const badCur = normalizeListing({ ...base, rate: 900, currency: "манат" });
  assert.equal(badCur.offer?.rateUsd, null);
});

test("old loads without an explicit expiry stay expired on re-import", () => {
  const old = normalizeListing({ externalId: "o", origin: "Tashkent", destination: "Almaty", loadingDate: new Date(Date.now() - 40 * 86_400_000), weight: 10000, weightUnit: "kg", bodyType: "tent", raw: {} });
  assert.ok(old.offer!.expiresAt < new Date());
  assert.ok(old.issues.some((i) => i.code === "EXPIRED"));
});

test("dedup: same load in English and Russian feeds is one opportunity", () => {
  const day = new Date(Date.now() + 2 * 86_400_000);
  const a = normalizeListing({ externalId: "A1", origin: "Tashkent, UZ", destination: "Almaty, KZ", loadingDate: day, weight: 20000, weightUnit: "kg", bodyType: "curtainsider", rate: 1280, currency: "USD", broker: "Caravan Bridge Logistics LLC", raw: {} }).offer!;
  const b = normalizeListing({ externalId: "B1", origin: "Ташкент", destination: "Алматы", loadingDate: day, weight: "20 т", bodyType: "тент", rate: 117000, currency: "руб", broker: "ООО «Caravan Bridge Logistics»", raw: {} }).offer!;
  assert.equal(fingerprint(a), fingerprint(b));
  const dup = findDuplicate(b, [{ id: "x", ...a, rateUsd: a.rateUsd!, brokerKey: a.brokerKey }]);
  assert.equal(dup?.id, "x");
  const other = normalizeListing({ externalId: "B2", origin: "Ташкент", destination: "Алматы", loadingDate: day, weight: "8 т", bodyType: "рефрижератор", rate: 600, currency: "долл", broker: "Other Co", raw: {} }).offer!;
  assert.equal(findDuplicate(other, [{ id: "x", ...a, rateUsd: a.rateUsd!, brokerKey: a.brokerKey }]), null);
});

test("csv parser handles quotes", () => {
  const rows = parseCsv('a,b\n1,"x, ""y"""\n');
  assert.deepEqual(rows, [{ a: "1", b: 'x, "y"' }]);
});

test("profitability matches the spec example", () => {
  const p = computeProfit({ revenueUsd: 1280, loadedKm: 790, deadheadKm: 35, fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, tollsUsd: 25, otherPerTripUsd: 20 });
  assert.equal(p.totalKm, 825);
  assert.equal(p.fuel, 250.8); // 825 km × 32 L/100 × $0.95
  assert.equal(p.profit, Math.round((1280 - 250.8 - 181.5 - 66 - 25 - 20) * 100) / 100);
  assert.ok(Math.abs(p.emptyPct - 35 / 825) < 1e-9);
});

const truck: MatchTruck = {
  id: "t", code: "T-1", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent", availableFrom: new Date(), status: "AVAILABLE",
  fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, otherPerTripUsd: 20,
};
const offer: MatchOffer = {
  id: "o", originCityId: "tashkent", destCityId: "almaty", originCountry: "UZ", destCountry: "KZ", loadingDate: new Date(Date.now() + 86_400_000),
  weightKg: 18000, volumeM3: 80, bodyType: "CURTAINSIDER", cargoType: "TEXTILES", distanceKm: 865, rateUsd: 1400, paymentTerms: null, brokerId: null,
};
const ctx: MatchContext = {
  prefs: { minRatePerKmUsd: null, maxDeadheadKm: 150, preferredCargo: [], preferredCountries: [], paymentTerms: [], routes: [] },
  benchmarks: new Map([["tashkent>almaty", 1.45]]),
  brokerScore: () => null,
  outbound: new Map(),
};

test("matching: compatible nearby load scores high with reasons", () => {
  const m = scoreMatch(truck, offer, ctx);
  assert.ok(m.eligible);
  assert.ok(m.score >= 70, `score ${m.score}`);
  assert.equal(m.deadheadKm, 0);
  assert.ok(m.reasons.some((r) => r.includes("already in Tashkent")));
});

test("matching: hard blockers make a load ineligible", () => {
  assert.equal(scoreMatch(truck, { ...offer, bodyType: "REFRIGERATED" }, ctx).eligible, false);
  assert.equal(scoreMatch(truck, { ...offer, weightKg: 24000 }, ctx).eligible, false);
  assert.equal(scoreMatch({ ...truck, status: "MAINTENANCE" }, offer, ctx).eligible, false);
});

test("matching: deadhead lowers the score", () => {
  const near = scoreMatch(truck, offer, ctx).score;
  const far = scoreMatch({ ...truck, currentCityId: "samarkand" }, offer, ctx).score;
  assert.ok(far < near);
});

test("broker reliability is withheld below minimum history", () => {
  assert.equal(computeReliability(true, [], 0).score, null);
  const r = computeReliability(true, Array.from({ length: 5 }, () => ({ rating: 5, paidOnTime: true, disputed: false, cancelled: false, isDemo: false })), 0);
  assert.equal(r.score, 100);
});

test("matching: an ineligible truck is never ranked as a strong match, regardless of its other components", () => {
  // Audit question: can a hard blocker still surface a high score? The scorer caps anything
  // ineligible at 35 even if every other weighted component (price, route, broker, prefs)
  // would otherwise push the raw weighted sum well above that.
  const greatCtx: MatchContext = { ...ctx, benchmarks: new Map([["tashkent>almaty", 0.5]]) }; // offer rate way above benchmark
  const incompatibleBody = scoreMatch(truck, { ...offer, bodyType: "REFRIGERATED" }, greatCtx);
  assert.equal(incompatibleBody.eligible, false);
  assert.ok(incompatibleBody.score <= 35, `expected capped score, got ${incompatibleBody.score}`);

  const overweight = scoreMatch(truck, { ...offer, weightKg: 24000 }, greatCtx);
  assert.equal(overweight.eligible, false);
  assert.ok(overweight.score <= 35, `expected capped score, got ${overweight.score}`);

  const offlineTruck = scoreMatch({ ...truck, status: "OFFLINE" }, offer, greatCtx);
  assert.equal(offlineTruck.eligible, false);
  assert.ok(offlineTruck.score <= 35, `expected capped score, got ${offlineTruck.score}`);
});

test("matching: a truck that can't physically reach pickup before loading is blocked, not just penalized", () => {
  // Truck is ~2,800 road km away (Moscow) and the load is ready for pickup right now — at
  // 550 km/day (AVG_KM_PER_DAY) that's ~5 days of driving, far past the 24h "tight but
  // possible" threshold the scorer uses, so this must be a hard blocker, not a warning.
  const strandedTruck: MatchTruck = { ...truck, currentCityId: "moscow", availableFrom: new Date() };
  const urgentOffer: MatchOffer = { ...offer, originCityId: "tashkent", loadingDate: new Date() };
  const m = scoreMatch(strandedTruck, urgentOffer, ctx);
  assert.equal(m.eligible, false);
  assert.ok(m.blockers.some((b) => /reach the pickup/i.test(b)), `expected a pickup-timing blocker, got: ${JSON.stringify(m.blockers)}`);
  assert.ok(m.score <= 35);
});

test("matching: missing market benchmark falls back to a margin-based price score instead of crashing or guessing a benchmark", () => {
  const noBenchmarkCtx: MatchContext = { ...ctx, benchmarks: new Map() };
  const m = scoreMatch(truck, offer, noBenchmarkCtx);
  assert.equal(m.benchmarkPerKm, null);
  const priceComponent = m.components.find((c) => c.key === "price")!;
  assert.ok(priceComponent.detail.includes("no lane benchmark yet"));
  // Must still be a finite, sane 0-100 score — not NaN/Infinity from dividing by a missing benchmark.
  assert.ok(Number.isFinite(priceComponent.score) && priceComponent.score >= 0 && priceComponent.score <= 100);
});

test("matching: an unpriced (negotiable) load scores neutrally and warns, without a divide-by-zero in profit math", () => {
  const unpriced: MatchOffer = { ...offer, rateUsd: 0 };
  const m = scoreMatch(truck, unpriced, ctx);
  assert.ok(m.warnings.some((w) => /cannot be estimated/i.test(w)));
  assert.equal(m.profit.margin, 0); // guarded, not -Infinity/NaN
  assert.ok(Number.isFinite(m.profit.profit));
});

test("profitability: zero-distance, zero-revenue edge case stays finite and non-misleading", () => {
  const p = computeProfit({ revenueUsd: 0, loadedKm: 0, deadheadKm: 0, fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, tollsUsd: 0, otherPerTripUsd: 20 });
  assert.equal(p.totalKm, 0);
  assert.equal(p.ratePerLoadedKm, 0); // guarded (would otherwise be 0/0 = NaN)
  assert.equal(p.profitPerKm, 0); // guarded (would otherwise be x/0 = Infinity)
  assert.equal(p.margin, 0);
  assert.equal(p.profit, -20); // still pays the fixed otherPerTripUsd even with no distance/revenue
});

test("broker reliability: insufficient history returns null score with an explanation, not a fabricated number", () => {
  const r = computeReliability(false, [{ rating: 4, paidOnTime: true, disputed: false, cancelled: false, isDemo: false }], 0); // only 1 review, below MIN_REVIEWS
  assert.equal(r.sufficient, false);
  assert.equal(r.score, null);
  assert.ok(r.explanation.includes("Insufficient history"));
});

test("natural language → filters (EN / RU / UZ)", () => {
  const now = new Date("2026-10-08T10:00:00Z");
  const en = parseQueryRules("Find a 20 ton refrigerated load from Tashkent to Kazakhstan next week", now).filters;
  assert.deepEqual(
    { origin: en.origin, destCountry: en.destCountry, weightMin: en.weightMin, body: en.body, from: en.loadingFrom, to: en.loadingTo },
    { origin: "tashkent", destCountry: "KZ", weightMin: 20000, body: ["REFRIGERATED"], from: "2026-10-12", to: "2026-10-18" },
  );
  const ru = parseQueryRules("из Ферганы в Москву завтра", now).filters;
  assert.equal(ru.origin, "fergana");
  assert.equal(ru.dest, "moscow");
  assert.equal(ru.loadingFrom, "2026-10-09");
  const uz = parseQueryRules("Toshkentdan Olmaotaga ertaga", now).filters;
  assert.equal(uz.origin, "tashkent");
  assert.equal(uz.dest, "almaty");
  const t = parseQueryRules("Find me a profitable load from Tashkent tomorrow for truck T-1024", now);
  assert.equal(t.truckCode, "T-1024");
  assert.equal(t.filters.sort, "profit");
});
