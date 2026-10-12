import { CITIES, COUNTRIES, estimateRoadKm, getCity } from "../domain/geo";
import type { BodyType, CargoType, Currency, PaymentTerm, QualityLevel } from "../domain/enums";
import { toUsd } from "../domain/currency";
import type { NormalizeResult, NormalizedOffer, ParsedListing, QualityIssue } from "./types";

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[«»"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ───────────── Cities & countries ─────────────

const cityAlias = new Map<string, string>();
for (const c of CITIES) for (const a of [c.id, c.name, ...c.aliases]) cityAlias.set(clean(a), c.id);
const countryAlias = new Map<string, string>();
for (const c of COUNTRIES) for (const a of [c.code, c.name, ...c.aliases]) countryAlias.set(clean(a), c.code);

/** "Ташкент", "Toshkent, UZ", "Tashkent (Uzbekistan)" → "tashkent". */
export function normalizeCity(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = clean(raw);
  if (cityAlias.has(s)) return cityAlias.get(s)!;
  // strip trailing ", country" / region qualifiers
  const head = clean(s.split(/[,/]| - /)[0]);
  if (cityAlias.has(head)) return cityAlias.get(head)!;
  // token scan for multi-word inputs: "г. Ташкент"
  for (const tok of s.replace(/^г\.\s*/, "").split(" ")) if (cityAlias.has(tok)) return cityAlias.get(tok)!;
  return null;
}

export function normalizeCountry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = clean(raw);
  return countryAlias.get(s) ?? null;
}

// ───────────── Vehicle & cargo vocabularies ─────────────

const BODY_PATTERNS: [RegExp, BodyType][] = [
  [/реф|refrig|reefer|холод|frigo/, "REFRIGERATED"],
  [/тент|tent|curtain|штор/, "CURTAINSIDER"],
  [/изотерм|фургон|\bbox\b|\bvan\b|цельномет/, "BOX"],
  [/площад|flatbed|платформ/, "FLATBED"],
  [/борт|open/, "OPEN"],
  [/цистерн|tank/, "TANKER"],
  [/контейн|container/, "CONTAINER"],
  [/автовоз|car.?carrier/, "CAR_CARRIER"],
  [/трал|low.?bed|низкоремн/, "LOWBED"],
];
export function normalizeBodyType(raw?: string | null): BodyType | null {
  if (!raw) return null;
  const s = clean(raw);
  for (const [re, v] of BODY_PATTERNS) if (re.test(s)) return v;
  return null;
}

const CARGO_PATTERNS: [RegExp, CargoType][] = [
  [/хлоп|cotton|paxta/, "COTTON"],
  [/текстил|textile|ткан|одежд|apparel/, "TEXTILES"],
  [/фрукт|овощ|produce|fruit|vegetable|черешн|абрикос|виноград|дын/, "PRODUCE"],
  [/продукт|food|еда|напит|beverage|мука|flour|сахар|sugar/, "FOOD"],
  [/строй|цемент|cement|construct|кирпич|brick|плитк|tile/, "CONSTRUCTION"],
  [/оборуд|equipment|станок|machin/, "EQUIPMENT"],
  [/хими|chemic|удобр|fertil/, "CHEMICALS"],
  [/топлив|fuel|диз|бензин|gsm|гсм/, "FUEL"],
  [/авто|vehicle|машин|\bcars?\b/, "VEHICLES"],
  [/электрон|electron|техник|appliance/, "ELECTRONICS"],
  [/мебел|furnit/, "FURNITURE"],
  [/метал|metal|steel|сталь|арматур|rebar|прокат/, "METAL"],
  [/тнп|general|сборн|разн|goods|товар/, "GENERAL"],
];
export function normalizeCargo(raw?: string | null): CargoType {
  if (!raw) return "GENERAL";
  const s = clean(raw);
  for (const [re, v] of CARGO_PATTERNS) if (re.test(s)) return v;
  return "GENERAL";
}

const PAYMENT_PATTERNS: [RegExp, PaymentTerm][] = [
  [/предоплат|prepa|advance|100%/, "PREPAID"],
  [/на загруз|on load|при загруз/, "ON_LOADING"],
  [/на выгруз|on unload|при выгруз|по факту|cash on deliv/, "ON_UNLOADING"],
  [/30|тридцат/, "NET_30"],
  [/14|две недел/, "NET_14"],
  [/\b7\b|недел/, "NET_7"],
];
export function normalizePaymentTerms(raw?: string | null): PaymentTerm | null {
  if (!raw) return null;
  const s = clean(raw);
  if (/^(prepaid|on_loading|on_unloading|net_7|net_14|net_30)$/.test(s)) return s.toUpperCase() as PaymentTerm;
  for (const [re, v] of PAYMENT_PATTERNS) if (re.test(s)) return v;
  return null;
}

// ───────────── Units ─────────────

/** Accepts 20000, "20 t", "20т", "20 тонн", "44,000 lb". Returns kg or null. */
export function normalizeWeightKg(value: unknown, unitHint?: string): number | null {
  if (value == null || value === "") return null;
  let num: number;
  let unit = (unitHint ?? "").toLowerCase();
  if (typeof value === "number") num = value;
  else {
    const m = String(value).toLowerCase().replace(/\s/g, "").replace(",", ".").match(/^([\d.]+)(.*)$/);
    if (!m) return null;
    num = parseFloat(m[1]);
    unit = m[2] || unit;
  }
  if (!Number.isFinite(num) || num <= 0) return null;
  if (/^(t|т|тн|тонн?|tons?|tonnes?)$/.test(unit)) return Math.round(num * 1000);
  if (/^(lb|lbs)$/.test(unit)) return Math.round(num * 0.4536);
  if (/^(kg|кг)?$/.test(unit)) {
    // A bare number under 100 is almost certainly tonnes in CIS listings.
    return Math.round(num < 100 && !unit ? num * 1000 : num);
  }
  return null;
}

export function normalizeVolumeM3(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CURRENCY_PATTERNS: [RegExp, Currency][] = [
  [/^\$|usd|долл|dollar/, "USD"],
  [/uzs|сум|so['‘’]?m|сўм/, "UZS"],
  [/€|eur|евро/, "EUR"],
  [/₽|rub|руб/, "RUB"],
  [/₸|kzt|тенге|тг/, "KZT"],
  [/¥|cny|rmb|юан/, "CNY"],
];
export function normalizeCurrency(raw?: string | null): Currency | null {
  if (!raw) return null;
  const s = clean(raw);
  for (const [re, v] of CURRENCY_PATTERNS) if (re.test(s)) return v;
  return null;
}

export function parseRate(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ───────────── Broker identity ─────────────

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};
// Applied after transliteration, so Cyrillic forms appear in Latin here (ООО → ooo, МЧЖ → mchzh).
const LEGAL_FORMS = /\b(ooo|oao|zao|ao|too|ip|chp|mchzh|mchj|xk|llc|ltd|llp|jsc|inc|co)\b/g;

/** "ООО «Silk Way Logistics»" and "Silk Way LLC" → "silkway". Used for dedup + broker matching. */
export function brokerKey(raw?: string | null): string | null {
  if (!raw) return null;
  const s = clean(raw)
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9]/g, "");
  return s.length >= 2 ? s : null;
}

/** Light phone masking for display — full numbers are only shown on explicit "Contact". */
export const maskPhone = (p?: string | null) => (p ? p.replace(/(\+?\d{3,5})\d+(\d{2})$/, "$1•••••$2") : null);

// ───────────── Main entry ─────────────

const DAY = 86_400_000;

export function normalizeListing(l: ParsedListing, now = new Date()): NormalizeResult {
  const issues: QualityIssue[] = [];
  const reject = (code: string, message: string) => issues.push({ code, severity: "REJECT", message });
  const warn = (code: string, message: string) => issues.push({ code, severity: "WARN", message });

  const originCityId = normalizeCity(l.origin);
  const destCityId = normalizeCity(l.destination);
  if (!l.origin) reject("MISSING_ORIGIN", "Origin is missing");
  else if (!originCityId) reject("UNKNOWN_ORIGIN", `Unrecognized origin "${l.origin}"`);
  if (!l.destination) reject("MISSING_DESTINATION", "Destination is missing");
  else if (!destCityId) reject("UNKNOWN_DESTINATION", `Unrecognized destination "${l.destination}"`);
  if (originCityId && originCityId === destCityId) reject("SAME_ORIGIN_DEST", "Origin equals destination");

  const loadingDate = parseDate(l.loadingDate);
  const unloadingDate = parseDate(l.unloadingDate);
  if (!loadingDate) reject("INVALID_LOADING_DATE", "Loading date is missing or invalid");
  if (loadingDate && unloadingDate && unloadingDate < loadingDate)
    warn("IMPOSSIBLE_DATES", "Unloading date is before loading date");

  const weightKg = normalizeWeightKg(l.weight, l.weightUnit);
  if (weightKg == null) reject("INVALID_WEIGHT", `Invalid weight "${l.weight}"`);
  else if (weightKg > 44_000) warn("SUSPICIOUS_WEIGHT", `Weight ${weightKg} kg exceeds a standard 44 t limit`);

  const bodyType = normalizeBodyType(l.bodyType) ?? "CURTAINSIDER";
  if (!normalizeBodyType(l.bodyType)) warn("UNKNOWN_BODY_TYPE", `Body type "${l.bodyType ?? ""}" not recognized — assumed curtainsider`);

  const rate = parseRate(l.rate);
  const currency = normalizeCurrency(l.currency);
  if (rate != null && !currency) warn("INVALID_CURRENCY", `Unknown currency "${l.currency}" — rate ignored`);
  if (rate == null) warn("NO_RATE", "No rate published (negotiable)");

  if (issues.some((i) => i.severity === "REJECT")) return { offer: null, issues, quality: "UNVERIFIED" };

  const distanceKm = estimateRoadKm(originCityId!, destCityId!);
  const rateUsd = rate != null && currency ? toUsd(rate, currency) : null;
  if (rateUsd != null && distanceKm > 0) {
    const perKm = rateUsd / distanceKm;
    if (perKm < 0.35 || perKm > 5) warn("SUSPICIOUS_RATE", `Rate $${perKm.toFixed(2)}/km is outside the plausible range`);
  }
  if (!l.broker) warn("NO_BROKER", "No broker / shipper identified");

  const expiresAt =
    // Default validity: two days after the loading date. Old loads must not come back to life on re-import.
    parseDate(l.expiresAt) ?? new Date(loadingDate!.getTime() + 2 * DAY);
  if (expiresAt < now) warn("EXPIRED", "Listing has expired");

  const offer: NormalizedOffer = {
    externalId: l.externalId,
    sourceUrl: l.sourceUrl,
    originCityId: originCityId!,
    destCityId: destCityId!,
    originCountry: getCity(originCityId!)!.country,
    destCountry: getCity(destCityId!)!.country,
    loadingDate: loadingDate!,
    unloadingDate,
    cargoType: normalizeCargo(l.cargo),
    weightKg: weightKg!,
    volumeM3: normalizeVolumeM3(l.volume),
    bodyType,
    truckType: l.truckType ?? null,
    distanceKm,
    rate: rateUsd != null ? rate : null,
    currency: rateUsd != null ? currency : null,
    rateUsd: rateUsd != null ? Math.round(rateUsd * 100) / 100 : null,
    paymentTerms: normalizePaymentTerms(l.paymentTerms),
    brokerName: l.broker?.trim() || null,
    brokerKey: brokerKey(l.broker),
    contactName: l.contactName ?? null,
    contactPhone: l.contactPhone ?? null,
    packaging: l.packaging ?? null,
    requirements: l.requirements ?? [],
    postedAt: parseDate(l.postedAt),
    expiresAt,
  };
  return { offer, issues, quality: qualityLevel(issues) };
}

const SERIOUS = new Set(["SUSPICIOUS_RATE", "SUSPICIOUS_WEIGHT", "IMPOSSIBLE_DATES", "INVALID_CURRENCY"]);
export function qualityLevel(issues: QualityIssue[], opts?: { brokerVerified?: boolean; sourceCount?: number }): QualityLevel {
  const codes = issues.map((i) => i.code).filter((c) => c !== "EXPIRED");
  if (codes.some((c) => SERIOUS.has(c))) return "UNVERIFIED";
  if (codes.length === 0 && (opts?.brokerVerified ?? false)) return "VERIFIED";
  if (codes.length === 0 && (opts?.sourceCount ?? 1) >= 2) return "VERIFIED";
  return "PARTIAL";
}
