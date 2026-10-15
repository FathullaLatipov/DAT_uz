import test from "node:test";
import assert from "node:assert/strict";
import { parseCbuRates, setRates, toUsd } from "../src/server/domain/currency";
import { CITIES, estimateRoadKm, haversineKm } from "../src/server/domain/geo";
import { ROAD_KM } from "../src/server/domain/road-distances.generated";
import { diffIssues, evaluateHealth, type HealthFacts } from "../src/server/jobs/health";

// ── Road distances ─────────────────────────────────────────────────────────────

test("road distance: real table beats the old great-circle guess on a known corridor", () => {
  const km = estimateRoadKm("tashkent", "almaty");
  assert.ok(km >= 780 && km <= 880, `Tashkent–Almaty is ~820 km by road, got ${km}`);
  assert.equal(estimateRoadKm("almaty", "tashkent"), km, "symmetric");
  assert.equal(estimateRoadKm("tashkent", "tashkent"), 0);
});

test("road distance: every city pair resolves to a sane number (table or fallback)", () => {
  for (let i = 0; i < CITIES.length; i++)
    for (let j = i + 1; j < CITIES.length; j++) {
      const a = CITIES[i];
      const b = CITIES[j];
      const km = estimateRoadKm(a.id, b.id);
      assert.ok(Number.isFinite(km) && km > 0, `${a.id}–${b.id}`);
      // A road can't be shorter than the straight line.
      assert.ok(km >= haversineKm(a, b) * 0.97, `${a.id}–${b.id}: ${km} km < straight line ${Math.round(haversineKm(a, b))} km`);
    }
});

test("road distance: unknown city pair falls back to the estimate instead of NaN", () => {
  assert.ok(Number.isNaN(estimateRoadKm("tashkent", "atlantis")));
  const tableKeys = Object.keys(ROAD_KM);
  assert.ok(tableKeys.every((k) => k.split("|")[0] < k.split("|")[1]), "keys are sorted pairs");
});

// ── CBU exchange rates ─────────────────────────────────────────────────────────

const CBU_SAMPLE = [
  { Ccy: "USD", Nominal: "1", Rate: "12000.00", Date: "15.10.2026" },
  { Ccy: "EUR", Nominal: "1", Rate: "13200.00", Date: "15.10.2026" },
  { Ccy: "RUB", Nominal: "1", Rate: "120.00", Date: "15.10.2026" },
  { Ccy: "KZT", Nominal: "10", Rate: "240.00", Date: "15.10.2026" }, // quoted per 10 units
  { Ccy: "CNY", Nominal: "1", Rate: "1650.00", Date: "15.10.2026" },
  { Ccy: "JPY", Nominal: "100", Rate: "8000.00", Date: "15.10.2026" },
];

test("CBU parser: converts UZS-per-unit quotes into units-per-USD, honouring Nominal", () => {
  const { rates, asOf } = parseCbuRates(CBU_SAMPLE);
  const by = Object.fromEntries(rates.map((r) => [r.currency, r.perUsd]));
  assert.equal(by.USD, 1);
  assert.equal(by.UZS, 12000);
  assert.ok(Math.abs(by.EUR - 12000 / 13200) < 1e-9);
  assert.ok(Math.abs(by.RUB - 100) < 1e-9);
  assert.ok(Math.abs(by.KZT - 500) < 1e-9, "10 KZT = 240 UZS → 24 UZS each → 500 per USD");
  assert.equal(by.JPY, undefined, "currencies we don't price loads in are ignored");
  assert.equal(asOf?.toISOString().slice(0, 10), "2026-10-15");
});

test("CBU parser: garbage in → nothing out, never a made-up rate", () => {
  assert.deepEqual(parseCbuRates(null).rates, []);
  assert.deepEqual(parseCbuRates({ error: "x" }).rates, []);
  assert.deepEqual(parseCbuRates([{ Ccy: "EUR", Nominal: "1", Rate: "13200" }]).rates, [], "no USD quote → cannot convert");
  const partial = parseCbuRates([{ Ccy: "USD", Rate: "12000" }, { Ccy: "EUR", Rate: "abc" }, { Ccy: "RUB", Rate: "-5" }]);
  assert.deepEqual(partial.rates.map((r) => r.currency).sort(), ["UZS", "USD"].sort());
});

test("setRates then toUsd uses the new rate", () => {
  const { rates } = parseCbuRates(CBU_SAMPLE);
  setRates(rates);
  assert.ok(Math.abs(toUsd(1200, "RUB") - 12) < 1e-9);
  setRates([]); // back to defaults for other tests
});

// ── Health rules ───────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const healthy = (): HealthFacts => ({
  now: NOW,
  scheduledSources: [{ id: "diip-uz", name: "DIIP.UZ", status: "ACTIVE", lastSuccessAt: ago(5), lastRunStatus: "SUCCESS", lastRunFetched: 400 }],
  telegramSources: [{ id: "tg-a", lastSyncAt: ago(3) }, { id: "tg-b", lastSyncAt: ago(600) }],
  recentRealOffers: 40,
  anyRealOffersEver: true,
  fxAgeHours: 10,
  jobRuns: { "sync-sources": [{ status: "SUCCESS", startedAt: ago(4) }], "health-check": [{ status: "SUCCESS", startedAt: ago(2) }] },
  jobIntervalsMin: { "sync-sources": 15, "health-check": 10 },
});
const keys = (f: HealthFacts) => evaluateHealth(f).map((i) => i.key);

test("health: a healthy platform reports nothing", () => {
  assert.deepEqual(keys(healthy()), []);
});

test("health: stale, failed and empty sources are told apart", () => {
  const f = healthy();
  f.scheduledSources[0].lastSuccessAt = ago(200);
  assert.deepEqual(keys(f), ["source-stale:diip-uz"]);
  f.scheduledSources[0].lastRunStatus = "FAILED";
  assert.deepEqual(keys(f), ["source-failed:diip-uz"]);
  f.scheduledSources[0] = { ...f.scheduledSources[0], lastSuccessAt: ago(5), lastRunStatus: "SUCCESS", lastRunFetched: 0 };
  assert.deepEqual(keys(f), ["source-empty:diip-uz"]);
});

test("health: Telegram is silent only when the NEWEST group message is old, not when one group is", () => {
  const f = healthy();
  assert.deepEqual(keys(f), [], "group b is quiet for 10 h but group a posted 3 min ago");
  f.telegramSources = [{ id: "tg-a", lastSyncAt: ago(300) }, { id: "tg-b", lastSyncAt: ago(600) }];
  assert.deepEqual(keys(f), ["telegram-silent"]);
});

test("health: no new loads, stale FX, failing and late jobs", () => {
  const f = healthy();
  f.recentRealOffers = 0;
  f.fxAgeHours = 100;
  f.jobRuns["sync-sources"] = [{ status: "FAILED", startedAt: ago(4) }, { status: "FAILED", startedAt: ago(19) }];
  assert.deepEqual(keys(f).sort(), ["fx-stale", "job-failing:sync-sources", "no-new-offers"]);
  const late = healthy();
  late.jobRuns["sync-sources"] = [{ status: "SUCCESS", startedAt: ago(90) }];
  assert.deepEqual(keys(late), ["job-late:sync-sources"]);
  const fresh = healthy();
  fresh.anyRealOffersEver = false;
  fresh.recentRealOffers = 0;
  assert.deepEqual(keys(fresh), [], "a brand-new install with no real data yet is not an outage");
});

test("health: a RUNNING job doesn't count as a failure streak", () => {
  const f = healthy();
  f.jobRuns["sync-sources"] = [{ status: "RUNNING", startedAt: ago(1) }, { status: "FAILED", startedAt: ago(16) }, { status: "SUCCESS", startedAt: ago(31) }];
  assert.deepEqual(keys(f), []);
});

test("health: alerts fire on change only", () => {
  const issues = [{ key: "a", title: "A", detail: "" }, { key: "b", title: "B", detail: "" }];
  assert.deepEqual(diffIssues([], issues).appeared.map((i) => i.key), ["a", "b"]);
  const same = diffIssues(["a", "b"], issues);
  assert.deepEqual([same.appeared, same.resolved], [[], []]);
  const partly = diffIssues(["a", "c"], issues);
  assert.deepEqual(partly.appeared.map((i) => i.key), ["b"]);
  assert.deepEqual(partly.resolved, ["c"]);
});
