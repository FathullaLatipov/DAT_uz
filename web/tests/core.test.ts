import { test } from "node:test";
import assert from "node:assert/strict";
import { brokerKey, normalizeBodyType, normalizeCity, normalizeCountry, normalizeCurrency, normalizeListing, normalizeWeightKg } from "../src/server/ingestion/normalize";
import { findDuplicate, fingerprint } from "../src/server/ingestion/dedupe";
import { parseCsv } from "../src/server/ingestion/adapters/csv";
import { computeProfit } from "../src/server/services/profitability";
import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";
import { computeReliability } from "../src/server/services/broker";
import { parseQueryRules } from "../src/server/ai/nlsearch";
import { buildWhere } from "../src/server/services/freight";
import { filtersFromParams } from "../src/server/services/filters";

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

test("buildWhere: destination radius, published-rate-only, and domestic/export/import/transit scope", () => {
  const destRadiusList = (w: ReturnType<typeof buildWhere>) => (w.AND as { destCityId?: { in: string[] } }[]).find((c) => c.destCityId)?.destCityId?.in;
  const destExactList = destRadiusList(buildWhere({ dest: "tashkent" }));
  const destRadiusWide = destRadiusList(buildWhere({ dest: "tashkent", destRadiusKm: 300 }));
  assert.deepEqual(destExactList, ["tashkent"]);
  // A radius must actually widen the match — not just restate the exact city. (This was the
  // one gap an independent review caught: the original test only checked the shape of the
  // query, never that a radius produces a strictly larger candidate set than an exact match.)
  assert.ok(destRadiusWide!.includes("tashkent"));
  assert.ok(destRadiusWide!.length > 1, `expected more than just the exact city, got ${JSON.stringify(destRadiusWide)}`);

  const hasRate = buildWhere({ hasRate: true });
  assert.ok((hasRate.AND as { rateUsd?: { gt: number } }[]).some((c) => c.rateUsd?.gt === 0));
  const hasRateFalse = buildWhere({ hasRate: false });
  const noHasRate = buildWhere({});
  // hasRate: false must behave identically to "unset", not add an inverted/negative clause.
  for (const w of [hasRateFalse, noHasRate]) assert.ok(!(w.AND as { rateUsd?: unknown }[]).some((c) => "rateUsd" in c));

  const domestic = buildWhere({ scope: "domestic" });
  assert.ok((domestic.AND as { originCountry?: string; destCountry?: string }[]).some((c) => c.originCountry === "UZ" && c.destCountry === "UZ"));
  const exportScope = buildWhere({ scope: "export" });
  assert.ok((exportScope.AND as { originCountry?: string }[]).some((c) => c.originCountry === "UZ"));
  const importScope = buildWhere({ scope: "import" });
  assert.ok((importScope.AND as { destCountry?: string }[]).some((c) => c.destCountry === "UZ"));
  const transit = buildWhere({ scope: "transit" });
  assert.equal((transit.AND as unknown[]).length, 5); // status + not-yet-expired + demo + 2 NOT clauses, no plain originCountry/destCountry equality

  // Combined filters compose via AND rather than one silently overriding another.
  const combined = buildWhere({ scope: "export", hasRate: true, dest: "almaty", destRadiusKm: 200 });
  const combinedAnd = combined.AND as Record<string, unknown>[];
  assert.ok(combinedAnd.some((c) => c.originCountry === "UZ"));
  assert.ok(combinedAnd.some((c) => (c.rateUsd as { gt?: number } | undefined)?.gt === 0));
  assert.ok(combinedAnd.some((c) => Array.isArray((c.destCityId as { in?: string[] } | undefined)?.in)));

  // Invalid enum/range values for the new fields are dropped (existing "bad key" behavior),
  // not silently coerced into something wrong — a legacy/malformed bookmarked URL keeps working
  // instead of 500ing or applying a nonsensical filter.
  const bogus = filtersFromParams({ scope: "not-a-real-scope", destRadiusKm: "99999", origin: "tashkent" });
  assert.equal(bogus.scope, undefined);
  assert.equal(bogus.destRadiusKm, undefined);
  assert.equal(bogus.origin, "tashkent"); // sibling valid params are preserved

  // A legacy/bookmarked URL with none of the new params produces exactly the same query shape
  // as before this change — no new AND clauses sneak in when the fields are simply absent.
  const legacy = buildWhere({ origin: "tashkent", body: ["CURTAINSIDER"] });
  const legacyAnd = legacy.AND as Record<string, unknown>[];
  assert.ok(!legacyAnd.some((c) => "destCityId" in c || "rateUsd" in c || "originCountry" in c || "destCountry" in c));
});

test("trade-direction scope: a route between two third countries (neither leg in Uzbekistan) classifies as transit, not domestic/export/import", () => {
  // Documents the classification rule explicitly, per an independent review's request: transit
  // requires BOTH legs to be outside UZ. A Moscow (RU) -> Almaty (KZ) route is the concrete
  // example — neither country is Uzbekistan, so it must fall only into the transit bucket.
  const transit = buildWhere({ scope: "transit" });
  const domestic = buildWhere({ scope: "domestic" });
  const exportScope = buildWhere({ scope: "export" });
  const importScope = buildWhere({ scope: "import" });
  const matchesRuToKz = (w: ReturnType<typeof buildWhere>) =>
    (w.AND as Record<string, unknown>[]).every((c) => {
      if ("originCountry" in c && typeof c.originCountry === "string") return c.originCountry === "RU";
      if ("destCountry" in c && typeof c.destCountry === "string") return c.destCountry === "KZ";
      if ("NOT" in c) {
        const not = c.NOT as Record<string, unknown>;
        if ("originCountry" in not) return not.originCountry !== "RU";
        if ("destCountry" in not) return not.destCountry !== "KZ";
      }
      return true;
    });
  assert.equal(matchesRuToKz(transit), true);
  assert.equal(matchesRuToKz(domestic), false);
  assert.equal(matchesRuToKz(exportScope), false);
  assert.equal(matchesRuToKz(importScope), false);
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

test("natural language → filters: regression for the specific example queries from the advanced-search brief", () => {
  const now = new Date("2026-10-14T10:00:00Z"); // a Wednesday
  // "в ближайшие N дней" with a spelled-out Russian number — \w in JS regex is ASCII-only, so
  // a naive `\w*` after a Cyrillic stem silently fails to consume the rest of the word and
  // breaks the match chain; this must use \p{L} (confirmed broken, then fixed, during this
  // audit — pinning it here).
  const a = parseQueryRules("Рефрижератор из Самарканда в Алматы, загрузка в ближайшие три дня.", now);
  assert.equal(a.filters.origin, "samarkand");
  assert.equal(a.filters.dest, "almaty");
  assert.deepEqual(a.filters.body, ["REFRIGERATED"]);
  assert.equal(a.filters.loadingFrom, "2026-10-14");
  assert.equal(a.filters.loadingTo, "2026-10-17");

  // "желательно с опубликованной ставкой" — excludes negotiable/unpriced loads.
  const b = parseQueryRules("Найди тент из Ташкента в Москву на следующей неделе, от 20 тонн, желательно с опубликованной ставкой.", now);
  assert.equal(b.filters.hasRate, true);
  assert.equal(b.filters.origin, "tashkent");
  assert.equal(b.filters.dest, "moscow");

  // Backhaul intent is recognized regardless of these additions.
  const c = parseQueryRules("Найди обратные грузы для моего грузовика после доставки в Москву.", now);
  assert.equal(c.intent, "backhaul");

  // English equivalent of the "within N days" fix — digits, not a spelled-out word, so this
  // path was never at risk of the \w-vs-\p{L} bug, but it shares the same regex branch.
  const en = parseQueryRules("Load from Tashkent to Almaty within 3 days", now);
  assert.equal(en.filters.loadingFrom, "2026-10-14");
  assert.equal(en.filters.loadingTo, "2026-10-17");

  // English and Russian-digit equivalents of "published rate only".
  const enRate = parseQueryRules("Show loads from Tashkent with a published rate", now);
  assert.equal(enRate.filters.hasRate, true);
  const ruDigit = parseQueryRules("груз из Ташкента в Алматы через 3 дня, с указанной ставкой", now);
  assert.equal(ruDigit.filters.hasRate, true);
  assert.equal(ruDigit.filters.loadingTo, "2026-10-17");
});
