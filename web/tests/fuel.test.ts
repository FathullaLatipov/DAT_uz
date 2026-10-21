import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FUEL_USD, effectiveFuelPrice } from "../src/server/domain/fuel";
import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";
import { COUNTRIES } from "../src/server/domain/geo";

const table = { UZ: 1.0, KZ: 0.6, RU: 0.8 };
const base = { originCountry: "UZ", destCountry: "KZ", deadheadKm: 0, loadedKm: 800, table, fallback: 0.95 };

test("effectiveFuelPrice: a loaded trip uses the average of the two end countries", () => {
  assert.equal(effectiveFuelPrice(base), 0.8);
  assert.equal(effectiveFuelPrice({ ...base, destCountry: "UZ" }), 1.0);
});

test("effectiveFuelPrice: the empty drive is fuelled where the truck stands, weighted by kilometres", () => {
  // 200 km empty in Kazakhstan (0.6), 800 km loaded UZ→KZ (0.8): (200*0.6 + 800*0.8) / 1000 = 0.76
  assert.equal(effectiveFuelPrice({ ...base, deadheadKm: 200, truckCountry: "KZ" }), 0.76);
  // truck country unknown: the empty drive counts at the pickup's country
  assert.equal(effectiveFuelPrice({ ...base, deadheadKm: 200 }), +((200 * 1.0 + 800 * 0.8) / 1000).toFixed(3));
});

test("effectiveFuelPrice: a country missing from the table falls back to the built-in default, then to the fallback", () => {
  assert.equal(effectiveFuelPrice({ ...base, table: {}, originCountry: "UZ", destCountry: "UZ" }), DEFAULT_FUEL_USD.UZ);
  assert.equal(effectiveFuelPrice({ ...base, table: {}, originCountry: "XX", destCountry: "XX" }), 0.95);
  assert.equal(effectiveFuelPrice({ ...base, loadedKm: 0, deadheadKm: 0 }), 0.8);
});

test("every country the app covers has a default diesel price", () => {
  for (const c of COUNTRIES) assert.ok(DEFAULT_FUEL_USD[c.code] > 0, c.code);
});

const now = new Date("2026-10-16T12:00:00Z");
const truck: MatchTruck = {
  id: "t", code: "T-1", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent", availableFrom: now, status: "AVAILABLE",
  fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, otherPerTripUsd: 20,
};
const offer: MatchOffer = {
  id: "o", originCityId: "tashkent", destCityId: "almaty", originCountry: "UZ", destCountry: "KZ", loadingDate: new Date(now.getTime() + 86_400_000),
  weightKg: 18000, volumeM3: 80, bodyType: "CURTAINSIDER", cargoType: "TEXTILES", distanceKm: 865, rateUsd: 1400, paymentTerms: null, brokerId: null,
};
const ctx: MatchContext = {
  prefs: { minRatePerKmUsd: null, maxDeadheadKm: 150, preferredCargo: [], preferredCountries: [], paymentTerms: [], routes: [] },
  benchmarks: new Map(), brokerScore: () => null, outbound: new Map(), now,
};

test("scoreMatch costs the fuel by country when the table is given, and by the truck's own price when switched off", () => {
  const own = scoreMatch(truck, offer, ctx).profit.fuel; // no table: the truck's 0.95
  const cheap = scoreMatch(truck, offer, { ...ctx, fuel: { UZ: 0.5, KZ: 0.5 } }).profit.fuel;
  assert.ok(cheap < own, `${cheap} < ${own}`);
  assert.equal(cheap, +(own * (0.5 / 0.95)).toFixed(2));
  const off = scoreMatch({ ...truck, fuelByCountry: false }, offer, { ...ctx, fuel: { UZ: 0.5, KZ: 0.5 } }).profit.fuel;
  assert.equal(off, own);
});
