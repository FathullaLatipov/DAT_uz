import assert from "node:assert/strict";
import test from "node:test";
import { NEAR_MAX_KM, nearestCity } from "../src/components/loads/near-me";

test("near me: a point in Tashkent resolves to Tashkent", () => {
  const r = nearestCity(41.31, 69.28);
  assert.equal(r.cityId, "tashkent");
  assert.ok(r.distanceKm < 15);
});

test("near me: a point between cities picks the closer one", () => {
  // Chirchiq is not a hub here; the nearest modelled city should still be Tashkent, not Samarkand.
  assert.equal(nearestCity(41.47, 69.58).cityId, "tashkent");
  assert.equal(nearestCity(39.7, 67.0).cityId, "samarkand");
});

test("near me: the middle of the ocean is farther than the allowed radius", () => {
  assert.ok(nearestCity(0, -30).distanceKm > NEAR_MAX_KM);
});
