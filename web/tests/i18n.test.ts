import test from "node:test";
import assert from "node:assert/strict";
import { CITIES, COUNTRIES } from "../src/server/domain/geo";
import { LABELS } from "../src/server/domain/enums";
import { LOCALES, negotiateLocale, type Locale } from "../src/i18n/config";
import { createI18n } from "../src/i18n/create";
import { MESSAGES } from "../src/i18n/messages";

/** Every message as "path → string", arrays by index, so two languages can be compared exactly. */
function flatten(node: unknown, path = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") out.set(path, node);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, `${path}[${i}]`).forEach((s, k) => out.set(k, s)));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) flatten(v, path ? `${path}.${k}` : k).forEach((s, kk) => out.set(kk, s));
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const en = flatten(MESSAGES.en);
const others = LOCALES.filter((l): l is Exclude<Locale, "en"> => l !== "en");

for (const l of others) {
  const dict = flatten(MESSAGES[l]);

  test(`i18n ${l}: has exactly the keys English has — nothing missing, nothing stray`, () => {
    const missing = [...en.keys()].filter((k) => !dict.has(k) && !/\.(one|few|many)$/.test(k));
    const extra = [...dict.keys()].filter((k) => !en.has(k) && !/\.(one|few|many|other)$/.test(k));
    assert.deepEqual(missing, [], `missing in ${l}`);
    assert.deepEqual(extra, [], `unexpected in ${l}`);
  });

  test(`i18n ${l}: every {placeholder} survived translation`, () => {
    const bad: string[] = [];
    for (const [k, v] of dict) {
      const src = en.get(k) ?? en.get(k.replace(/\.(one|few|many)$/, ".other"));
      if (src !== undefined && placeholders(src) !== placeholders(v)) bad.push(`${k}: "${src}" → "${v}"`);
    }
    assert.deepEqual(bad, []);
  });

  test(`i18n ${l}: no empty strings`, () => {
    assert.deepEqual([...dict].filter(([, v]) => !v.trim()).map(([k]) => k), []);
  });
}

test("i18n: Latin-script languages contain no Cyrillic look-alikes (a Cyrillic 'о' inside Latin text breaks search and sorting)", () => {
  for (const l of ["en", "uz"] as const) {
    // `parse.*` quotes Russian sample input ("20 т", "завтра") on purpose — it shows what the parser accepts.
    const hits = [...flatten(MESSAGES[l])].filter(([k, v]) => !k.startsWith("parse.") && /[Ѐ-ӿ]/.test(v)).map(([k]) => k);
    assert.deepEqual(hits, [], `${l} has Cyrillic characters`);
  }
});

test("i18n ru: Russian text is actually Russian (no untranslated English left behind)", () => {
  // Brand names, units and codes legitimately stay Latin; flag strings with long English-only words.
  const allowed = /^(Karvon|DIIP\.UZ|Telegram|CSV|\$\/км|—)/;
  const suspicious = [...flatten(MESSAGES.ru)].filter(([k, v]) => !/[Ѐ-ӿ]/.test(v) && !allowed.test(v) && v.length > 12 && !k.startsWith("geo.") && !/Placeholder$/.test(k));
  assert.deepEqual(suspicious, []);
});

test("i18n: plural sets carry the forms each language needs", () => {
  // A plural set is recognised by its "one" form; a plain field that happens to be called "other" is not one.
  const bases = [...en.keys()].filter((k) => k.endsWith(".one")).map((k) => k.replace(/\.one$/, ""));
  assert.ok(bases.length >= 5, "expected the known plural sets");
  const ru = flatten(MESSAGES.ru);
  const uz = flatten(MESSAGES.uz);
  for (const base of bases) {
    assert.ok(en.has(`${base}.other`), `en ${base} lacks "other"`);
    for (const form of ["one", "few", "many", "other"]) assert.ok(ru.has(`${base}.${form}`), `ru ${base} lacks "${form}"`);
    assert.ok(uz.has(`${base}.other`), `uz ${base} lacks "other"`);
  }
});

test("i18n: every enum code, city and country the app knows has a label in every language", () => {
  for (const l of LOCALES) {
    const m = MESSAGES[l];
    assert.deepEqual(Object.keys(LABELS).filter((c) => !(c in m.enums)), [], `${l} enums`);
    assert.deepEqual(CITIES.filter((c) => !(c.id in m.geo.cities)).map((c) => c.id), [], `${l} cities`);
    assert.deepEqual(COUNTRIES.filter((c) => !(c.code in m.geo.countries)).map((c) => c.code), [], `${l} countries`);
  }
});

test("i18n: English labels still match the legacy LABELS table the cabinet uses", () => {
  for (const [code, text] of Object.entries(LABELS)) assert.equal(MESSAGES.en.enums[code], text, code);
});

test("negotiateLocale: honours q-values, region tags and unknown languages", () => {
  assert.equal(negotiateLocale("ru-RU,ru;q=0.9,en;q=0.8"), "ru");
  assert.equal(negotiateLocale("en-US,en;q=0.9,ru;q=0.5"), "en");
  assert.equal(negotiateLocale("uz-UZ,uz;q=0.9"), "uz");
  assert.equal(negotiateLocale("de-DE,de;q=0.9,ru;q=0.4"), "ru", "first language we support, by preference");
  assert.equal(negotiateLocale("de,fr;q=0.8"), "en", "nothing we support → default");
  assert.equal(negotiateLocale("ru;q=0,en"), "en", "q=0 means unacceptable");
  assert.equal(negotiateLocale(""), "en");
  assert.equal(negotiateLocale(null), "en");
  assert.equal(negotiateLocale("*"), "en");
});

test("t(): fills placeholders and leaves unknown ones visible", () => {
  const i = createI18n("en", MESSAGES.en);
  assert.equal(i.t("footer.rights", { year: 2026 }), "© 2026 Karvon · Tashkent");
  assert.equal(i.t("footer.rights"), "© {year} Karvon · Tashkent", "missing variable stays visible instead of vanishing");
});

test("tn(): Russian picks one/few/many correctly, English one/other, Uzbek always other", () => {
  const ru = createI18n("ru", MESSAGES.ru);
  const forms = [1, 2, 4, 5, 11, 12, 21, 22, 25, 101].map((n) => ru.tn("time.dayAgo", n));
  assert.deepEqual(forms, [
    "1 день назад", "2 дня назад", "4 дня назад", "5 дней назад", "11 дней назад", "12 дней назад", "21 день назад", "22 дня назад", "25 дней назад", "101 день назад",
  ]);
  const en = createI18n("en", MESSAGES.en);
  assert.equal(en.tn("time.dayAgo", 1), "1 day ago");
  assert.equal(en.tn("time.dayAgo", 3), "3 days ago");
  const uz = createI18n("uz", MESSAGES.uz);
  assert.equal(uz.tn("time.dayAgo", 1), "1 kun oldin");
  assert.equal(uz.tn("time.dayAgo", 7), "7 kun oldin");
});

test("label/city/country: translated, with a safe fallback to the raw code", () => {
  const ru = createI18n("ru", MESSAGES.ru);
  assert.equal(ru.label("REFRIGERATED"), "Рефрижератор");
  assert.equal(ru.city("tashkent"), "Ташкент");
  assert.equal(ru.country("KZ"), "Казахстан");
  assert.equal(ru.label("SOMETHING_NEW"), "SOMETHING_NEW");
  assert.equal(ru.label(null), "—");
  assert.equal(ru.city("atlantis"), "atlantis");
  assert.equal(createI18n("uz", MESSAGES.uz).city("fergana"), "Farg'ona");
});

test("ago(): picks seconds/minutes/hours/days and speaks the language", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const at = (ms: number) => new Date(now - ms);
  const ru = createI18n("ru", MESSAGES.ru);
  assert.equal(ru.ago(at(10_000), now), "только что");
  assert.equal(ru.ago(at(5 * 60_000), now), "5 мин назад");
  assert.equal(ru.ago(at(3 * 3_600_000), now), "3 ч назад");
  assert.equal(ru.ago(at(2 * 86_400_000), now), "2 дня назад");
  assert.equal(createI18n("en", MESSAGES.en).ago(at(5 * 60_000), now), "5 min ago");
});

test("numbers and units follow the language", () => {
  const en = createI18n("en", MESSAGES.en);
  const ru = createI18n("ru", MESSAGES.ru);
  assert.equal(en.km(1234.4), "1,234 km");
  assert.match(ru.km(1234.4), /^1\s234 км$/u, "Russian groups with a (non-breaking) space");
  assert.equal(en.usd(1250), "$1,250");
  assert.equal(en.perKm(1.2), "$1.20/km");
  assert.match(ru.perKm(1.2), /^\$1,20\/км$/u);
  assert.equal(en.tonnes(20_000), "20 t");
  assert.equal(ru.tonnes(20_000), "20 т");
});

// ── API errors ────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findErrorTemplate } from "../src/i18n/errors";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("errors: every message the API can send has a translation template", () => {
  const files = [...sourceFiles("src/app/api"), "src/server/http.ts"];
  const literal = /(?:HttpError\(\d+,\s*|error:\s*|localize\()\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g;
  const uncovered: string[] = [];
  let seen = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(literal)) {
      const raw = m[1] ?? m[2];
      // `${expression}` becomes a placeholder value so a template can match it.
      const text = raw.replace(/\$\{[^}]*\}/g, "X").replace(/\\'/g, "'");
      // Messages assembled elsewhere (e.g. joined validation issues) are not literals.
      if (!text || /^\W*$/.test(text)) continue;
      seen++;
      if (!findErrorTemplate(text)) uncovered.push(`${f}: ${text}`);
    }
  }
  assert.ok(seen >= 20, `expected to find the known messages, found ${seen}`);
  assert.deepEqual(uncovered, []);
});

test("errors: templates capture their placeholders, and unknown text passes through", () => {
  assert.deepEqual(findErrorTemplate("T-1024 can't take this load: Cargo 30.0 t exceeds truck capacity 20.0 t"), { key: "truckCantTake", vars: { code: "T-1024", reason: "Cargo 30.0 t exceeds truck capacity 20.0 t" } });
  assert.deepEqual(findErrorTemplate("T-7 is not available right now."), { key: "truckNotAvailable", vars: { code: "T-7" } });
  assert.equal(findErrorTemplate("Load not found.")?.key, "loadNotFound");
  assert.equal(findErrorTemplate("Truck not found.")?.key, "truckNotFound");
  assert.equal(findErrorTemplate("Truck not found in your fleet.")?.key, "truckNotInFleet", "anchored: the shorter message must not swallow the longer one");
  assert.equal(findErrorTemplate("Something nobody wrote a translation for"), null);
});

test("errors: every language renders every template with its placeholders filled", () => {
  for (const l of LOCALES) {
    const i = createI18n(l, MESSAGES[l]);
    assert.match(i.t("errors.truckCantTake", { code: "T-1", reason: "REASON" }), /T-1[\s\S]*REASON|REASON[\s\S]*T-1/, l);
    assert.doesNotMatch(i.t("errors.truckNotAvailable", { code: "T-1" }), /\{/);
  }
});

// ── Scoring-engine text follows the request language ──────────────────────────

import { scoreMatch, type MatchContext, type MatchOffer, type MatchTruck } from "../src/server/services/matching";

const truck: MatchTruck = {
  id: "t1", code: "T-1", bodyType: "CURTAINSIDER", capacityKg: 20_000, volumeM3: 82, currentCityId: "tashkent",
  availableFrom: new Date("2026-10-15T00:00:00Z"), status: "AVAILABLE",
  fuelLPer100km: 32, fuelPriceUsd: 0.95, driverCostPerKm: 0.22, maintenancePerKm: 0.08, otherPerTripUsd: 20,
};
const offer: MatchOffer = {
  id: "o1", originCityId: "tashkent", destCityId: "almaty", originCountry: "UZ", destCountry: "KZ", loadingDate: new Date("2026-10-16T08:00:00Z"),
  weightKg: 18_000, volumeM3: 70, bodyType: "CURTAINSIDER", cargoType: "GENERAL", distanceKm: 820, rateUsd: 1250, paymentTerms: null, brokerId: null,
};
const ctx = (locale?: Locale): MatchContext => ({
  prefs: { minRatePerKmUsd: null, maxDeadheadKm: 150, preferredCargo: [], preferredCountries: [], paymentTerms: [], routes: [] },
  benchmarks: new Map([["tashkent>almaty", 1.2]]),
  brokerScore: () => null,
  outbound: new Map([["almaty", 6]]),
  now: new Date("2026-10-15T06:00:00Z"),
  i18n: locale ? createI18n(locale, MESSAGES[locale]) : undefined,
});

test("matching: explanations come out in the caller's language and stay English by default", () => {
  const en = scoreMatch(truck, offer, ctx());
  const enExplicit = scoreMatch(truck, offer, ctx("en"));
  assert.deepEqual(en.reasons, enExplicit.reasons, "no translator = English");
  assert.ok(en.reasons.some((r) => r.includes("already in Tashkent")));

  const ru = scoreMatch(truck, offer, ctx("ru"));
  assert.ok(ru.reasons.some((r) => r.includes("Ташкент")), JSON.stringify(ru.reasons));
  assert.ok(ru.components.every((c) => /[Ѐ-ӿ]/.test(c.label)), "component labels translated");
  assert.equal(ru.score, en.score, "language never changes the numbers");
  assert.equal(ru.profit.profit, en.profit.profit);

  const uz = scoreMatch(truck, offer, ctx("uz"));
  assert.ok(uz.reasons.some((r) => r.includes("Toshkent")), JSON.stringify(uz.reasons));
  assert.equal(uz.score, en.score);
});

test("matching: blockers are translated too, with the same eligibility decision", () => {
  const heavy = { ...offer, weightKg: 30_000 };
  const en = scoreMatch(truck, heavy, ctx());
  const ru = scoreMatch(truck, heavy, ctx("ru"));
  assert.equal(en.eligible, false);
  assert.equal(ru.eligible, false);
  assert.match(en.blockers[0], /exceeds truck capacity/);
  assert.match(ru.blockers[0], /превышает грузоподъёмность/);
});
