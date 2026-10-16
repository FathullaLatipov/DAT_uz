import assert from "node:assert/strict";
import test from "node:test";
import { estimateRoadKm, freshGps, nearestCityTo, roadKmFromPoint } from "../src/server/domain/geo";
import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";

const now = new Date("2026-10-16T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

const truck: MatchTruck = {
  id: "t", code: "T-1", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "samarkand", availableFrom: now, status: "AVAILABLE",
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

test("gps: a fresh fix in the pickup city means no deadhead, whatever the truck's city says", () => {
  const cityBased = scoreMatch(truck, offer, ctx);
  assert.equal(cityBased.deadheadKm, estimateRoadKm("samarkand", "tashkent"));
  const withFix = scoreMatch({ ...truck, lat: 41.31, lng: 69.27, positionAt: ago(1) }, offer, ctx);
  assert.equal(withFix.deadheadKm, 0);
  assert.ok(withFix.score > cityBased.score);
});

test("gps: a fix between cities gives a real, smaller-than-city distance", () => {
  // Near Chirchiq, ~40 km from Tashkent.
  const m = scoreMatch({ ...truck, lat: 41.47, lng: 69.58, positionAt: ago(2) }, offer, ctx);
  assert.ok(m.deadheadKm > 30 && m.deadheadKm < 80, `deadhead ${m.deadheadKm}`);
});

test("gps: a stale fix (older than 12 h) is ignored", () => {
  const m = scoreMatch({ ...truck, lat: 41.31, lng: 69.27, positionAt: ago(13) }, offer, ctx);
  assert.equal(m.deadheadKm, estimateRoadKm("samarkand", "tashkent"));
  assert.equal(freshGps({ lat: 41.3, lng: 69.2, positionAt: ago(13) }, now), null);
  assert.deepEqual(freshGps({ lat: 41.3, lng: 69.2, positionAt: ago(1) }, now), { lat: 41.3, lng: 69.2 });
  assert.equal(freshGps({ lat: null, lng: null, positionAt: null }, now), null);
});

test("gps: helpers", () => {
  assert.equal(nearestCityTo(41.31, 69.27).city.id, "tashkent");
  assert.equal(roadKmFromPoint(41.3, 69.24, "tashkent"), 0);
  assert.ok(roadKmFromPoint(41.3, 69.24, "samarkand") > 250);
  assert.ok(Number.isNaN(roadKmFromPoint(41.3, 69.24, "nowhere")));
});
