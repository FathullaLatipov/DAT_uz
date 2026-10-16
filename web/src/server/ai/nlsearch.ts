import { COUNTRIES, CITIES } from "../domain/geo";
import { normalizeBodyType, normalizeCargo } from "../ingestion/normalize";
import type { LoadFilters } from "../services/filters";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";

/**
 * Rule-based natural-language → structured filters. Always available (no API key needed),
 * and used as the fallback when the LLM provider is unavailable or returns something invalid.
 */

export type Intent = "search" | "recommend" | "backhaul" | "chain" | "help";

export interface ParsedQuery {
  filters: LoadFilters;
  truckCode: string | null;
  intent: Intent;
  understood: string[]; // human-readable list of what was extracted
  parser: "rules" | "llm";
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const cityTerms = CITIES.flatMap((c) => [c.name, ...c.aliases].map((a) => ({ term: a.toLowerCase(), id: c.id, name: c.name })))
  .sort((a, b) => b.term.length - a.term.length);
const countryTerms = COUNTRIES.flatMap((c) => [c.name, ...c.aliases].map((a) => ({ term: a.toLowerCase(), code: c.code, name: c.name })))
  .filter((t) => t.term.length > 3)
  .sort((a, b) => b.term.length - a.term.length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Cyrillic names inflect ("Фергана" → "Ферганы", "Москва" → "в Москву"): match on the stem plus a short ending.
const wordRe = (term: string) => {
  if (/[а-яё]/i.test(term) && term.length >= 5)
    // Up to 5 trailing letters, captured as group 2: covers both a Russian case ending
    // ("Ферганы") and an Uzbek Cyrillic one, which can add a connecting vowel ("Алматига").
    return new RegExp(`(^|[^\\p{L}])${escape(term.slice(0, -1))}(\\p{L}{0,5})(?=$|[^\\p{L}])`, "iu");
  // Latin terms may carry an Uzbek case suffix, captured as group 2.
  return new RegExp(`(^|[^\\p{L}])${escape(term)}(dan|gacha|ga|da)?(?=$|[^\\p{L}])`, "iu");
};

const FROM_WORDS = /(^|[^\p{L}])(from|out of|leaving|из|от|dan)\s*$/iu;
const TO_WORDS = /(^|[^\p{L}])(to|into|towards|в|во|до|на|ga)\s*$/iu;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** What a date phrase meant — formatted for the reader by `describeDate`. */
type DateNote = "today" | "tomorrow" | "dayAfterTomorrow" | "nextWeek" | "thisWeek" | { within: number } | { weekday: number };

function describeDate(note: DateNote, i: I18n) {
  if (typeof note === "string") return i.t(`ai.dates.${note}`);
  if ("within" in note) return i.tn("ai.withinDays", note.within);
  return i.m.ai.weekdays[note.weekday];
}

function parseDates(text: string, now: Date): { from?: string; to?: string; note?: DateNote } {
  const t = text.toLowerCase();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // \b is ASCII-only in JS, so Cyrillic words use explicit Unicode letter boundaries.
  if (/(^|[^\p{L}])(today|сегодня|bugun|бугун)(?!\p{L})/u.test(t)) return { from: iso(today), to: iso(today), note: "today" };
  if (/(day after tomorrow|послезавтра)/.test(t)) {
    const d = new Date(today.getTime() + 2 * DAY);
    return { from: iso(d), to: iso(d), note: "dayAfterTomorrow" };
  }
  if (/(^|[^\p{L}])(tomorrow|завтра|ertaga|эртага)(?!\p{L})/u.test(t)) {
    const d = new Date(today.getTime() + DAY);
    return { from: iso(d), to: iso(d), note: "tomorrow" };
  }
  if (/(next week|следующей неделе|след\. неделе)/.test(t)) {
    const dow = today.getUTCDay() || 7;
    const mon = new Date(today.getTime() + (8 - dow) * DAY);
    return { from: iso(mon), to: iso(new Date(mon.getTime() + 6 * DAY)), note: "nextWeek" };
  }
  if (/(this week|на этой неделе)/.test(t)) {
    const dow = today.getUTCDay() || 7;
    return { from: iso(today), to: iso(new Date(today.getTime() + (7 - dow) * DAY)), note: "thisWeek" };
  }
  // "через 3 дня" / "in 3 days" / "в ближайшие 3 дня" / "в ближайшие три дня" — the Russian
  // phrasing commonly drops "через" for "в (ближайшие|следующие) N дней", and N is spelled out
  // as a word at least as often as digits for small counts.
  const RU_NUM: Record<string, number> = { один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
  const numWord = `\\d+|${Object.keys(RU_NUM).join("|")}`;
  const inDays = t.match(new RegExp(`(?:in|within|через|в\\s+(?:ближайши|следующи)\\p{L}*)\\s+(${numWord})\\s*(?:days?|дн\\p{L}*)`, "u"));
  if (inDays) {
    const n = /^\d+$/.test(inDays[1]) ? Number(inDays[1]) : RU_NUM[inDays[1]];
    return { from: iso(today), to: iso(new Date(today.getTime() + n * DAY)), note: { within: n } };
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(on )?${WEEKDAYS[i]}\\b`).test(t)) {
      const diff = (i - today.getUTCDay() + 7) % 7 || 7;
      const d = new Date(today.getTime() + diff * DAY);
      return { from: iso(d), to: iso(d), note: { weekday: i } };
    }
  }
  return {};
}

export function parseQueryRules(text: string, now = new Date(), i18n?: I18n): ParsedQuery {
  const i = i18n ?? englishI18n();
  const t = ` ${text.toLowerCase()} `;
  const f: LoadFilters = {};
  const understood: string[] = [];

  // Truck reference: "T-1024", "truck 1024"
  const tm = text.match(/\b[Tt]-?(\d{3,5})\b/) ?? text.match(/truck\s*#?\s*(\d{3,5})/i);
  const truckCode = tm ? `T-${tm[1]}` : null;
  if (truckCode) understood.push(i.t("ai.truck", { code: truckCode }));

  // Cities, in order of appearance, with role from the preceding word.
  const found: { id: string; name: string; idx: number; role: "from" | "to" | null }[] = [];
  const taken: [number, number][] = [];
  for (const c of cityTerms) {
    const m = wordRe(c.term).exec(t);
    if (!m) continue;
    const idx = m.index + m[1].length;
    if (taken.some(([a, b]) => idx < b && idx + c.term.length > a)) continue;
    if (found.some((x) => x.id === c.id)) continue;
    taken.push([idx, idx + c.term.length]);
    const before = t.slice(Math.max(0, idx - 12), idx);
    // Uzbek marks direction with suffixes: "Toshkentdan"/"Тошкентдан" (from), "Olmaotaga"/
    // "Алматига" (to). The Cyrillic branch captures up to 5 trailing letters rather than the
    // exact suffix, so these are endsWith checks, not exact matches.
    const suffix = m[2] ?? "";
    const role =
      /^dan$/.test(suffix) || /дан$/.test(suffix) || FROM_WORDS.test(before)
        ? "from"
        : /^(ga|gacha)$/.test(suffix) || /(гача|га)$/.test(suffix) || TO_WORDS.test(before)
          ? "to"
          : null;
    found.push({ id: c.id, name: c.name, idx, role });
  }
  found.sort((a, b) => a.idx - b.idx);
  const fromCity = found.find((c) => c.role === "from") ?? found.find((c) => c.role === null);
  const toCity = found.find((c) => c.role === "to" && c !== fromCity) ?? found.find((c) => c !== fromCity && c.role === null);
  if (fromCity) {
    f.origin = fromCity.id;
    understood.push(i.t("ai.from", { name: i.city(fromCity.id) }));
  }
  if (toCity) {
    f.dest = toCity.id;
    understood.push(i.t("ai.to", { name: i.city(toCity.id) }));
  }

  // Destination country ("to Kazakhstan", "в Россию")
  if (!f.dest) {
    for (const c of countryTerms) {
      const stem = c.term.length >= 5 ? c.term.slice(0, -1) : c.term; // "россия" → "росси" matches "россию"
      const m = new RegExp(`(^|[^\\p{L}])${escape(stem)}\\p{L}*`, "iu").exec(t);
      if (!m) continue;
      const before = t.slice(Math.max(0, m.index - 12), m.index + m[1].length);
      if (FROM_WORDS.test(before)) {
        if (!f.origin) {
          f.originCountry = c.code;
          understood.push(i.t("ai.from", { name: i.country(c.code) }));
        }
      } else {
        f.destCountry = c.code;
        understood.push(i.t("ai.to", { name: i.country(c.code) }));
      }
      break;
    }
  }

  // Weight: "20 ton", "20t", "20 т", "20000 kg"
  const wt = t.match(/(\d+(?:[.,]\d+)?)\s*(?:-?\s*)(t|ton|tons|tonne|tonnes|т|тонн\w*)(?=[^\p{L}])/iu);
  const wkg = t.match(/(\d{3,6})\s*(kg|кг)/);
  if (wt) {
    f.weightMin = Math.round(parseFloat(wt[1].replace(",", ".")) * 1000);
    understood.push(i.t("ai.weightMinT", { n: f.weightMin / 1000 }));
  } else if (wkg) {
    f.weightMin = Number(wkg[1]);
    understood.push(i.t("ai.weightMinKg", { n: f.weightMin }));
  }

  // Body type & cargo
  const body = normalizeBodyType(t.match(/(refrigerat\w*|reefer|реф\w*|tent\w*|тент\w*|curtain\w*|flatbed|площадк\w*|tanker|цистерн\w*|container|контейнер\w*|box|изотерм\w*|car carrier|автовоз\w*|lowbed|трал\w*|open body|борт\w*)/)?.[0]);
  if (body) {
    f.body = [body];
    understood.push(i.label(body).toLowerCase());
  }
  const cargoWord = t.match(/(cotton|хлоп\w*|textile\w*|текстил\w*|produce|fruit\w*|vegetable\w*|фрукт\w*|овощ\w*|food|продукт\w*|construction|строй\w*|cement|equipment|оборуд\w*|chemical\w*|хими\w*|fuel|топлив\w*|vehicles?|cars|electronics?|электрон\w*|furniture|мебел\w*|metal|steel|метал\w*)/)?.[0];
  if (cargoWord) {
    const c = normalizeCargo(cargoWord);
    f.cargo = [c];
    understood.push(i.label(c).toLowerCase());
  }

  // Rate: "$1.4/km", "1.4 per km", "above $1000"
  const pk = t.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(?:\$\s*)?(?:\/|per)\s*km/);
  if (pk) {
    f.ratePerKmMin = parseFloat(pk[1].replace(",", "."));
    understood.push(i.t("ai.ratePerKmMin", { n: f.ratePerKmMin }));
  }
  const minRate = t.match(/(?:above|over|more than|min(?:imum)?|от|больше)\s*\$\s*(\d{3,6})/) ?? t.match(/\$\s*(\d{3,6})\s*\+/);
  if (minRate) {
    f.rateMin = Number(minRate[1]);
    understood.push(i.t("ai.rateMin", { n: f.rateMin }));
  }
  // "with a published rate" / "с опубликованной ставкой" / "с ценой" — excludes negotiable
  // (unpriced) loads, distinct from the rate-threshold matches above.
  if (/(published rate|with a rate|с\s+(?:опубликованн\p{L}+|указанн\p{L}+)\s+ставк\p{L}*|с\s+цен\p{L}*)/u.test(t)) {
    f.hasRate = true;
    understood.push(i.t("ai.publishedOnly"));
  }

  // Dates
  const d = parseDates(t, now);
  if (d.from) {
    f.loadingFrom = d.from;
    f.loadingTo = d.to;
    understood.push(i.t("ai.loading", { when: d.note ? describeDate(d.note, i) : "" }));
  }

  // Intent
  let intent: Intent = "search";
  if (/(backhaul|return load|way back|обратн|return trip)/.test(t)) intent = "backhaul";
  else if (/(round trip|chain|plan .*trip|кругов|цепоч)/.test(t)) intent = "chain";
  else if (/(profitab|best|recommend|выгодн|лучш|suggest|what should)/.test(t)) intent = "recommend";
  else if (/^\s*(help|what can you do|помощь)\s*$/.test(t)) intent = "help";

  if (/(profitab|выгодн|profit)/.test(t)) f.sort = "profit";
  else if (intent === "recommend") f.sort = "score";

  return { filters: f, truckCode, intent, understood, parser: "rules" };
}
