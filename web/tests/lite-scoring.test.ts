import assert from "node:assert/strict";
import test from "node:test";
import { scoreMatch, bestTruckFor, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";
import { englishI18n } from "../src/i18n/default";

const now = new Date("2026-10-16T12:00:00Z");
const base: MatchTruck = {
  id: "t", code: "T-1", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent", availableFrom: now, status: "AVAILABLE",
  fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, otherPerTripUsd: 20,
};
const offer: MatchOffer = {
  id: "o", originCityId: "tashkent", destCityId: "almaty", originCountry: "UZ", destCountry: "KZ", loadingDate: new Date(now.getTime() + 86_400_000),
  weightKg: 18000, volumeM3: 80, bodyType: "CURTAINSIDER", cargoType: "TEXTILES", distanceKm: 865, rateUsd: 1400, paymentTerms: null, brokerId: null,
};
const ctx: MatchContext = {
  prefs: { minRatePerKmUsd: 1.1, maxDeadheadKm: 150, preferredCargo: ["TEXTILES"], preferredCountries: ["KZ"], paymentTerms: ["ON_UNLOADING"], routes: [{ originCityId: "tashkent", destCityId: "almaty", destCountry: null }] },
  benchmarks: new Map([["tashkent>almaty", 1.34]]), brokerScore: (id) => (id ? 70 : null), outbound: new Map([["almaty", 7]]), now, fuel: { UZ: 0.95, KZ: 0.6 }, i18n: englishI18n(),
};
const lite: MatchContext = { ...ctx, lite: true };

const trucks: MatchTruck[] = [
  base,
  { ...base, id: "t2", currentCityId: "samarkand", bodyType: "REFRIGERATED" },
  { ...base, id: "t3", capacityKg: 10000 },
  { ...base, id: "t4", status: "MAINTENANCE" },
  { ...base, id: "t5", currentCityId: "bukhara", availableFrom: new Date(now.getTime() + 3 * 86_400_000) },
  { ...base, id: "t6", cargoHeightM: 2.0, adr: false },
  { ...base, id: "t7", fuelByCountry: false, lat: 41.3, lng: 69.2, positionAt: now },
];
const offers: MatchOffer[] = [
  offer,
  { ...offer, id: "o2", rateUsd: 0 },
  { ...offer, id: "o3", destCityId: "moscow", destCountry: "RU", distanceKm: 3300, brokerId: "b1" },
  { ...offer, id: "o4", weightKg: 25000 },
  { ...offer, id: "o5", cargoHeightM: 3, oversize: true, requirements: JSON.stringify(["ADR"]) },
  { ...offer, id: "o6", originCityId: "fergana", loadingDate: new Date(now.getTime() - 86_400_000) },
  { ...offer, id: "o7", bodyType: "REFRIGERATED", volumeM3: null, paymentTerms: "ON_UNLOADING" },
];

test("lite scoring gives exactly the numbers of full scoring", () => {
  for (const t of trucks) for (const o of offers) {
    const a = scoreMatch(t, o, ctx);
    const b = scoreMatch(t, o, lite);
    const where = `${t.id} × ${o.id}`;
    assert.equal(b.score, a.score, where);
    assert.equal(b.eligible, a.eligible, where);
    assert.equal(b.deadheadKm, a.deadheadKm, where);
    assert.equal(b.readyAt.getTime(), a.readyAt.getTime(), where);
    assert.equal(b.benchmarkPerKm, a.benchmarkPerKm, where);
    assert.deepEqual(b.profit, a.profit, where);
    assert.equal(b.blockers.length, a.blockers.length, where);
    assert.equal(b.warnings.length, a.warnings.length, where);
    assert.deepEqual(b.components.map((c) => [c.key, c.score, c.weight]), a.components.map((c) => [c.key, c.score, c.weight]), where);
  }
});

test("lite scoring builds no text; full scoring still does", () => {
  const full = scoreMatch(base, offer, ctx);
  assert.ok(full.reasons.length > 0 && full.reasons.every((r) => r.length > 0));
  const l = scoreMatch(base, offer, lite);
  assert.ok(l.reasons.every((r) => r === "") && l.warnings.every((w) => w === "") && l.components.every((c) => c.label === ""));
});

test("bestTruckFor picks the same truck in lite and full mode", () => {
  for (const o of offers) {
    const a = bestTruckFor(trucks, o, ctx)!;
    const b = bestTruckFor(trucks, o, lite)!;
    assert.equal(b.truckId, a.truckId, o.id);
    assert.equal(b.score, a.score, o.id);
  }
});

test("lite scoring is much cheaper (guard against the text work creeping back in)", () => {
  const run = (c: MatchContext) => { const t0 = performance.now(); for (let n = 0; n < 40; n++) for (const t of trucks) for (const o of offers) scoreMatch(t, o, c); return performance.now() - t0; };
  run(lite); run(ctx); // warm up
  const full = run(ctx);
  const fast = run(lite);
  console.log(`      full ${full.toFixed(0)} ms, lite ${fast.toFixed(0)} ms for ${40 * trucks.length * offers.length} pairs (${(full / fast).toFixed(1)}x)`);
  assert.ok(fast < full * 0.6, `lite ${fast.toFixed(0)} ms vs full ${full.toFixed(0)} ms`);
});
