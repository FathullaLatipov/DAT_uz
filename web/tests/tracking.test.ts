import assert from "node:assert/strict";
import test from "node:test";
import { getCity } from "../src/server/domain/geo";
import { thin, tripProgress, type TripForTracking } from "../src/server/services/tracking";

const t0 = new Date("2026-10-20T06:00:00Z");
const trip: TripForTracking = { status: "IN_TRANSIT", originCityId: "tashkent", destCityId: "almaty", startedAt: t0, etaAt: new Date(t0.getTime() + 36 * 3_600_000), loadedKm: 820 };
const cost = { fuelLPer100km: 32, fuelPriceUsd: 1 };
const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);

test("tracking: with no GPS the truck is placed on the line from elapsed time and marked estimated", () => {
  const p = tripProgress(trip, [], cost, at(18)); // half of the planned 36 h
  assert.equal(p.estimated, true);
  assert.ok(Math.abs(p.progress - 0.5) < 0.01, `progress ${p.progress}`);
  const o = getCity("tashkent")!, d = getCity("almaty")!;
  assert.ok(Math.abs(p.current.lat - (o.lat + d.lat) / 2) < 0.2);
  assert.equal(p.traveledKm + p.remainingKm, 820);
});

test("tracking: a GPS fix decides the progress from the road distance left", () => {
  const taraz = { lat: 42.9, lng: 71.37, at: at(10) }; // roughly 40% of the way
  const p = tripProgress(trip, [taraz], cost, at(10.1));
  assert.equal(p.estimated, false);
  assert.equal(p.stale, false);
  assert.ok(p.progress > 0.3 && p.progress < 0.7, `progress ${p.progress}`);
  assert.deepEqual(p.current, { lat: 42.9, lng: 71.37 });
  assert.ok(p.remainingKm > 0 && p.remainingKm < 820);
  assert.ok(p.etaAt.getTime() > at(10.1).getTime());
});

test("tracking: an old fix is flagged stale; a finished trip is 100% at the destination", () => {
  const p = tripProgress(trip, [{ lat: 42.9, lng: 71.37, at: at(10) }], cost, at(12));
  assert.equal(p.stale, true);
  const done = tripProgress({ ...trip, status: "COMPLETED" }, [], cost, at(40));
  assert.equal(done.progress, 1);
  assert.equal(done.remainingKm, 0);
  assert.equal(done.estimated, false);
});

test("tracking: diesel follows the truck's profile on the loaded leg", () => {
  const p = tripProgress(trip, [], cost, at(18));
  assert.equal(p.fuel.totalL, Math.round((820 * 32) / 100));
  assert.ok(Math.abs(p.fuel.usedL - p.fuel.totalL / 2) <= 2);
  assert.equal(p.fuel.totalUsd, p.fuel.totalL * 1);
});

test("tracking: a long track is thinned but keeps both ends", () => {
  const pts = Array.from({ length: 1000 }, (_, i) => i);
  const out = thin(pts, 100);
  assert.equal(out.length, 100);
  assert.equal(out[0], 0);
  assert.equal(out[out.length - 1], 999);
  assert.deepEqual(thin([1, 2, 3], 100), [1, 2, 3]);
});
