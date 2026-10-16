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
    const hits = [...flatten(MESSAGES[l])].filter(([, v]) => /[Ѐ-ӿ]/.test(v)).map(([k]) => k);
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
