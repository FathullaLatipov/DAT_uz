import assert from "node:assert/strict";
import test from "node:test";
import { splitDriving, tripTime, AVG_SPEED_KMH } from "../src/server/domain/hos";
import { transitDaysWithBorders } from "../src/server/domain/borders";
import { estimateTransitDays } from "../src/server/domain/geo";

test("a short drive has only the break rule: 0.75 h after each 4.5 h", () => {
  assert.deepEqual(splitDriving(3), { drivingH: 3, restH: 0, totalH: 3 });
  assert.equal(splitDriving(4.5).totalH, 4.5);
  assert.equal(splitDriving(6).totalH, 6.75);
  assert.equal(splitDriving(9).totalH, 9.75);
  assert.equal(splitDriving(0).totalH, 0);
});

test("one driver: every further 9 h of driving costs a night, planned as a 24 h day", () => {
  assert.equal(splitDriving(9.1).totalH, 24 + 0.1);
  assert.equal(splitDriving(18).totalH, 24 + 9.75);
  assert.equal(splitDriving(27).totalH, 48 + 9.75);
  const s = splitDriving(20);
  assert.equal(s.totalH, s.drivingH + s.restH);
});

test("a team of two covers twice the driving a day, with only handover time", () => {
  assert.equal(splitDriving(10, 2).totalH, 10.5);
  assert.equal(splitDriving(18, 2).totalH, 18.5);
  assert.equal(splitDriving(36, 2).totalH, 24 + 18.5);
  for (const h of [5, 12, 20, 40]) assert.ok(splitDriving(h, 2).totalH < splitDriving(h, 1).totalH || h <= 4.5, `team faster at ${h} h`);
});

test("tripTime: routed minutes beat the distance; borders add; days round up", () => {
  const byKm = tripTime({ km: 610 });
  assert.equal(Math.round(byKm.drivingH * 100), Math.round((610 / AVG_SPEED_KMH) * 100));
  const routed = tripTime({ km: 610, drivingMinutes: 300 });
  assert.equal(routed.drivingH, 5);
  const withBorder = tripTime({ km: 610, drivingMinutes: 300, borderH: 22 });
  assert.equal(withBorder.elapsedH, routed.elapsedH + 22);
  assert.equal(withBorder.days, Math.ceil(withBorder.elapsedH / 24));
  assert.equal(tripTime({ km: 1 }).days, 1);
});

test("transit days: the plain driving estimate inside a country, the team shorter across a border", () => {
  assert.equal(transitDaysWithBorders(500, "UZ", "UZ"), estimateTransitDays(500));
  const one = transitDaysWithBorders(2200, "UZ", "RU", 1);
  const two = transitDaysWithBorders(2200, "UZ", "RU", 2);
  assert.ok(two < one, `${two} < ${one}`);
  assert.ok(transitDaysWithBorders(865, "UZ", "KZ", 1, 600) >= transitDaysWithBorders(865, "UZ", "KZ", 1, 400));
});
