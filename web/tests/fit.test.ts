import assert from "node:assert/strict";
import test from "node:test";
import { checkFit, needsAdr, parseCargoSize, typicalPassport } from "../src/server/domain/fit";
import { parseAd } from "../src/server/ingestion/textparse";
import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";
import { truckSchema } from "../src/app/api/trucks/schema";

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
const passport = { cargoLengthM: 13.6, cargoWidthM: 2.45, cargoHeightM: 2.7, adr: false };

test("checkFit: a cargo that fits has no blockers", () => {
  const r = checkFit(passport, { cargoLengthM: 12, cargoWidthM: 2.4, cargoHeightM: 2.6 });
  assert.deepEqual(r.blockers, []);
  assert.equal(r.checked, true);
});

test("checkFit: each too-big dimension blocks, with both numbers", () => {
  const r = checkFit(passport, { cargoLengthM: 14, cargoWidthM: 2.6, cargoHeightM: 3 });
  assert.deepEqual(r.blockers.map((b) => b.code), ["TOO_LONG", "TOO_WIDE", "TOO_HIGH"]);
  assert.deepEqual(r.blockers[2], { code: "TOO_HIGH", cargo: 3, truck: 2.7 });
});

test("checkFit: unknown truck data never blocks, it only asks for the passport", () => {
  const r = checkFit({}, { cargoHeightM: 3 });
  assert.deepEqual(r.blockers, []);
  assert.equal(r.checked, false);
  assert.deepEqual(r.warnings.map((w) => w.code), ["NO_PASSPORT"]);
  // A load that states no size needs no passport.
  assert.deepEqual(checkFit({}, {}).warnings, []);
});

test("checkFit: dangerous goods need an ADR truck; oversize only warns", () => {
  assert.equal(checkFit(passport, { adrClass: "3" }).blockers[0].code, "NEEDS_ADR");
  assert.equal(checkFit({ ...passport, adr: true }, { adrClass: "3" }).blockers.length, 0);
  assert.equal(needsAdr({ requirements: ["ADR", "TIR"] }), true);
  assert.equal(needsAdr({ requirements: ["TIR", "reefer +2"] }), false);
  const o = checkFit(passport, { oversize: true });
  assert.equal(o.blockers.length, 0);
  assert.deepEqual(o.warnings.map((w) => w.code), ["OVERSIZE"]);
});

test("parseCargoSize reads sizes, oversize and ADR from ad text", () => {
  assert.deepEqual(parseCargoSize("Ташкент - Алматы 20т тент, габариты 13.6x2.45x2.7"), { oversize: false, lengthM: 13.6, widthM: 2.45, heightM: 2.7 });
  assert.deepEqual(parseCargoSize("6 х 2,4 х 2,5 м, негабарит"), { oversize: true, lengthM: 6, widthM: 2.4, heightM: 2.5 });
  assert.equal(parseCargoSize("груз ADR 3, 20т").adrClass, "3");
  assert.equal(parseCargoSize("опасный груз класс 8").adrClass, "8");
  assert.equal(parseCargoSize("опасный груз").adrClass, "0");
  const none = parseCargoSize("Ташкент - Алматы 20т тент 1300$ 28.10");
  assert.equal(none.oversize, false);
  assert.equal(none.lengthM, undefined);
  assert.equal(none.adrClass, undefined);
  // Not metres of cargo: a date range or a ratio must not become a size.
  assert.equal(parseCargoSize("200x100x50 mm").lengthM, undefined);
});

test("parseAd carries the size into the listing", () => {
  const r = parseAd("Ташкент - Алматы, 12т тент, 13.6x2.45x2.7, ADR 3, загрузка 28.10, 1300$, +998 90 123 45 67", 0, "b", new Date("2026-10-20T09:00:00Z"));
  assert.ok(r.listing, r.problems.join("; "));
  assert.equal(r.listing!.cargoHeightM, 2.7);
  assert.equal(r.listing!.adrClass, "3");
});

test("scoreMatch: a too-tall cargo blocks the truck and says why", () => {
  const m = scoreMatch({ ...truck, ...passport }, { ...offer, cargoHeightM: 3.1 }, ctx);
  assert.equal(m.eligible, false);
  assert.ok(m.blockers.some((b) => b.includes("3.1") && b.includes("2.7")), m.blockers.join("|"));
  assert.equal(scoreMatch({ ...truck, ...passport }, { ...offer, cargoHeightM: 2.5 }, ctx).eligible, true);
});

test("scoreMatch: ADR cargo needs ADR, read from the stored requirements too", () => {
  const withAdr = { ...offer, requirements: JSON.stringify(["ADR"]) };
  assert.equal(scoreMatch({ ...truck, ...passport }, withAdr, ctx).eligible, false);
  assert.equal(scoreMatch({ ...truck, ...passport, adr: true }, withAdr, ctx).eligible, true);
  assert.equal(scoreMatch({ ...truck, ...passport }, { ...offer, requirements: "not json" }, ctx).eligible, true);
});

test("scoreMatch: unknown truck size warns but does not block", () => {
  const m = scoreMatch(truck, { ...offer, cargoHeightM: 3 }, ctx);
  assert.equal(m.eligible, true);
  assert.ok(m.warnings.some((w) => /dimensions/i.test(w)), m.warnings.join("|"));
});

test("typicalPassport is self-consistent for every truck type", () => {
  for (const type of ["SEMI", "RIGID", "VAN", "ROAD_TRAIN"]) {
    const p = typicalPassport(type, "CURTAINSIDER");
    assert.ok(p.cargoHeightM <= p.heightM && p.cargoLengthM <= p.lengthM && p.cargoWidthM <= p.widthM, type);
  }
});

test("truckSchema: the cargo space cannot be taller than the vehicle; empty passport is fine", () => {
  const base = { code: "T-9", truckType: "SEMI", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent", status: "AVAILABLE", availableFrom: "2026-10-20T08:00", fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.2, maintenancePerKm: 0.08, otherPerTripUsd: 20 };
  assert.equal(truckSchema.safeParse(base).success, true);
  assert.equal(truckSchema.safeParse({ ...base, cargoHeightM: 2.7, heightM: 4, cargoLengthM: 13.6, lengthM: 16.5, adr: true }).success, true);
  assert.equal(truckSchema.safeParse({ ...base, cargoHeightM: 4.5, heightM: 4 }).success, false);
  assert.equal(truckSchema.safeParse({ ...base, heightM: 9 }).success, false);
});

test("the board scope filter accepts 'international' and keeps the older values", async () => {
  const { filtersFromParams } = await import("../src/server/services/filters");
  assert.equal(filtersFromParams({ scope: "international" }).scope, "international");
  assert.equal(filtersFromParams({ scope: "domestic" }).scope, "domestic");
  assert.equal(filtersFromParams({ scope: "export" }).scope, "export");
  assert.equal(filtersFromParams({ scope: "nonsense" }).scope, undefined);
});
