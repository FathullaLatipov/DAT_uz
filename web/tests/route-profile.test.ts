import assert from "node:assert/strict";
import test from "node:test";
import { hasDimensions, legKey, orsFailure, orsRestrictions, parseOrsRoute, profileKey, profileOf, simplifyPath, type Pt } from "../src/server/domain/route-profile";

test("profileOf rounds, leaves unknown values out and shares a key between near-identical trucks", () => {
  const a = profileOf({ heightM: 3.98, widthM: 2.55, lengthM: 16.4, grossWeightKg: 39800, axleLoadKg: 10100 }, false);
  const b = profileOf({ heightM: 4.0, widthM: 2.55, lengthM: 16.5, grossWeightKg: 40000, axleLoadKg: 10000 }, false);
  assert.deepEqual(a, b);
  assert.deepEqual(b, { heightM: 4, widthM: 2.55, lengthM: 16.5, weightT: 40, axleLoadT: 10 });
  assert.deepEqual(profileOf({}, false), {});
  assert.equal(hasDimensions(profileOf({}, true)), false);
  assert.equal(hasDimensions(b), true);
  assert.notEqual(profileKey(b), profileKey({ ...b, hazmat: true }));
});

test("legKey is stable for the same city pair and differs per profile", () => {
  const from = { lat: 41.3111, lng: 69.2797 };
  const to = { lat: 39.654, lng: 66.9597 };
  const p = profileOf({ heightM: 4 }, false);
  assert.equal(legKey(from, to, p), legKey({ lat: 41.3113, lng: 69.2801 }, to, p)); // a few metres apart: same entry
  assert.notEqual(legKey(from, to, p), legKey(from, to, profileOf({ heightM: 3.5 }, false)));
  assert.notEqual(legKey(from, to, p), legKey(to, from, p));
});

test("orsRestrictions sends only what is known, in the engine's names", () => {
  assert.deepEqual(orsRestrictions({}), {});
  assert.deepEqual(orsRestrictions({ heightM: 4, weightT: 40, axleLoadT: 10, hazmat: true }), { height: 4, weight: 40, axleload: 10, hazmat: true });
});

test("simplifyPath keeps the shape and the ends, drops redundant points, and handles long paths", () => {
  const straight: Pt[] = Array.from({ length: 100 }, (_, i) => [i / 10, i / 10]);
  assert.deepEqual(simplifyPath(straight, 0.001), [[0, 0], [9.9, 9.9]]);
  const corner: Pt[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
  assert.deepEqual(simplifyPath(corner, 0.01), [[0, 0], [2, 0], [2, 2]]);
  const long: Pt[] = Array.from({ length: 200_000 }, (_, i) => [i * 0.0001, Math.sin(i / 500)]);
  assert.ok(simplifyPath(long, 0.002).length < 5000);
  assert.deepEqual(simplifyPath([[1, 2]], 0.1), [[1, 2]]);
});

test("parseOrsRoute reads distance, time, path and toll share; refuses answers without a route", () => {
  const coords: Pt[] = Array.from({ length: 11 }, (_, i) => [69 + i * 0.1, 41 - i * 0.05]);
  const ok = parseOrsRoute({ features: [{ geometry: { coordinates: coords }, properties: { summary: { distance: 305_400, duration: 13_000 }, extras: { tollways: { values: [[0, 5, 0], [5, 10, 1]] } } } }] });
  assert.ok(ok);
  assert.equal(ok!.km, 305.4);
  assert.equal(ok!.minutes, 217);
  assert.equal(ok!.tollShare, 0.5);
  assert.deepEqual(ok!.path[0], [69, 41]);
  assert.equal(parseOrsRoute({ features: [] }), null);
  assert.equal(parseOrsRoute(null), null);
  assert.equal(parseOrsRoute({ features: [{ geometry: { coordinates: [[1, 2]] }, properties: { summary: { distance: 1, duration: 1 } } }] }), null);
  // No toll information from the engine: unknown, not zero.
  assert.equal(parseOrsRoute({ features: [{ geometry: { coordinates: coords }, properties: { summary: { distance: 1000, duration: 100 } } }] })!.tollShare, null);
});

test("orsFailure tells a stable 'no road' from outages, limits and a bad key", () => {
  assert.equal(orsFailure(404, { error: { code: 2010 } }), "NO_ROUTE");
  assert.equal(orsFailure(400, { error: { code: 2009 } }), "NO_ROUTE");
  assert.equal(orsFailure(403, null), "BAD_KEY");
  assert.equal(orsFailure(429, null), "LIMIT");
  assert.equal(orsFailure(503, null), "BUSY");
  assert.equal(orsFailure(400, { error: { code: 9999 } }), "FAILED");
});
