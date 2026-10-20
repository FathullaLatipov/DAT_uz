import assert from "node:assert/strict";
import test from "node:test";
import { BORDER_EDGES, borderSummary, crossingsBetween, transitDaysWithBorders } from "../src/server/domain/borders";
import { estimateTollsUsd } from "../src/server/services/profitability";
import { COUNTRIES, estimateTransitDays } from "../src/server/domain/geo";

const path = (a: string, b: string) => crossingsBetween(a, b).map((c) => `${c.from}>${c.to}`).join(" ");

test("no crossings inside a country; neighbours have one", () => {
  assert.deepEqual(crossingsBetween("UZ", "UZ"), []);
  assert.equal(path("UZ", "KZ"), "UZ>KZ");
  assert.equal(path("KZ", "UZ"), "KZ>UZ");
});

test("a corridor through a third country lists every border in order", () => {
  assert.equal(path("UZ", "RU"), "UZ>KZ KZ>RU");
  assert.equal(path("UZ", "BY"), "UZ>KZ KZ>RU RU>BY");
  assert.equal(path("UZ", "CN"), "UZ>KG KG>CN"); // the quicker of the two usual corridors
});

test("the corridor is the same both ways, and every covered country is connected to Uzbekistan", () => {
  assert.equal(crossingsBetween("RU", "UZ").length, crossingsBetween("UZ", "RU").length);
  for (const c of COUNTRIES) assert.ok(c.code === "UZ" || crossingsBetween("UZ", c.code).length > 0, `no corridor UZ→${c.code}`);
});

test("inside the customs union there is no fee and only the waybill", () => {
  const kzRu = crossingsBetween("KZ", "RU")[0];
  assert.equal(kzRu.feeUsd, 0);
  assert.deepEqual(kzRu.docs, ["CMR"]);
  const uzKz = crossingsBetween("UZ", "KZ")[0];
  assert.equal(uzKz.feeUsd, 40);
  assert.ok(uzKz.docs.includes("TIR"));
});

test("every range is ordered and sensible", () => {
  for (const e of BORDER_EDGES) assert.ok(e.hoursLow >= 0 && e.hoursLow <= e.hoursHigh && e.hoursHigh <= 120, `${e.a}-${e.b}`);
});

test("borderSummary adds the legs up", () => {
  const s = borderSummary("UZ", "RU");
  assert.equal(s.crossings.length, 2);
  assert.equal(s.hoursLow, 8 + 2);
  assert.equal(s.hoursHigh, 36 + 12);
  assert.equal(s.feeUsd, 40);
  assert.deepEqual(borderSummary("UZ", "UZ"), { crossings: [], hoursLow: 0, hoursHigh: 0, feeUsd: 0 });
});

test("transit time: unchanged inside a country, longer across borders", () => {
  assert.equal(transitDaysWithBorders(500, "UZ", "UZ"), estimateTransitDays(500));
  const plain = estimateTransitDays(865);
  const across = transitDaysWithBorders(865, "UZ", "KZ");
  assert.ok(across >= plain);
  assert.equal(across, Math.ceil(865 / 550 + 22 / 24)); // 22 h = the middle of 8–36 h
});

test("tolls: corridor fees replace the flat border estimate; the old default still applies without them", () => {
  assert.equal(estimateTollsUsd(100, "UZ", "UZ"), 1.0 + 0);
  assert.equal(estimateTollsUsd(100, "UZ", "KZ"), 1.5 + 40);
  assert.equal(estimateTollsUsd(100, "UZ", "KZ", 0), 1.5);
  assert.equal(estimateTollsUsd(100, "UZ", "KZ", 80), 1.5 + 80);
});
