import { parseQueryRules } from "../ai/nlsearch";
import { normalizeCurrency } from "./normalize";
import { parseCargoSize } from "../domain/fit";
import type { ParsedListing } from "./types";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";

/**
 * Free-text freight ads (as copied from boards, Telegram or WhatsApp) → ParsedListing.
 * Works on text the user pasted themselves; it never fetches anything.
 * Understands RU/UZ/EN: "Ташкент - Алматы, 20т тент, загрузка 12.10, 1300$, нал, +998 90 123 45 67".
 */

// The lookbehind keeps a phone from starting inside a date ("28.10 5 000 000") or another number.
const PHONE = /(?<![\d.,/])(\+?\d[\d ()-]{8,}\d)/g;

/** A phone number has 9+ digits; shorter digit runs ("5 000 000") are prices. */
function findPhone(text: string): string | undefined {
  return [...text.matchAll(PHONE)].map((m) => m[1].trim()).find((p) => p.replace(/\D/g, "").length >= 9);
}
/** First e-mail address in an ad, if any (trailing punctuation from the sentence is dropped). */
export function findEmail(text: string): string | undefined {
  return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0].replace(/[.,;:]+$/, "");
}
const stripPhone = (text: string) => {
  const p = findPhone(text);
  return p ? text.replace(p, " ") : text;
};
// A date never starts right after a digit, dot, comma or slash ("20.5 т" is a weight, not 20 May).
const DATE = /(?<![\d.,/])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)/g;
/** Ads that give no date but say the cargo is ready or urgent (Russian, Uzbek Latin and Cyrillic). */
const READY_NOW = /готов|срочн|сегодня|сейчас|hozir|tayyor|тайёр|тайер|шошил|shoshil/iu;
/** What follows "20.5" when it is a quantity or a price rather than a date. */
const UNIT_AFTER = /^\s?(?:т(?!\p{L})|тонн|кг|kg|t(?!\p{L})|м3|м³|куб|[$€₽](?!\s?\d)|usd|eur|долл|у\.?\s?е|сум|so['’]?m)/iu;
// Number = digits with optional thousands groups ("5 000 000", "1,300", "1.200", "1300.50"); no nested
// quantifiers over the same characters, so pasted input can't trigger catastrophic backtracking.
// A group is exactly three digits, so "19.10 900" is not read as "10 900".
const NUM = String.raw`\d{1,3}(?:[ ,.]\d{3}(?!\d)){1,3}(?:[.,]\d{1,2})?|\d{1,9}(?:[.,]\d{1,2})?`;
// The amount must not start inside another number or a date ("19.10 900$", "19.10.2026 900$"), and
// per-km / per-tonne quotes are not the load's price. ("19.10 $900" — a date, then a prefixed price — is
// handled in parseRate.)
const PER = String.raw`(?!\s?/\s?(?:км|km|т(?!\p{L})|t(?!\p{L})))`;
const RATE = new RegExp(
  String.raw`(?<![\d.,/])(${NUM})\s?(\$|usd|долл\w*|у\.?\s?е\.?|eur|€|евро|rub|руб\w*|₽|kzt|тенге|₸|cny|юан\w*|uzs|сум\w*|so['’]?m)${PER}|(\$|€|₽)\s?(${NUM})${PER}`,
  "iug",
);

/** Splits a pasted blob into individual ads: blank lines, or lines starting with a bullet/number. */
export function splitAds(text: string): string[] {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n+/);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim());
    const bulleted = lines.filter((l) => /^\s*(?:[-•*]|\d+[.)])\s+\S/.test(l));
    if (lines.length > 1 && bulleted.length === lines.length) out.push(...lines.map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")));
    else if (lines.length) out.push(lines.join(" "));
  }
  return out.map((s) => s.trim()).filter((s) => s.length >= 12);
}

function parseRate(ad: string): { rate: number; currency: string } | null {
  // First quote that parses; an amount in an unknown currency is skipped rather than ending the search.
  RATE.lastIndex = 0;
  for (let m = RATE.exec(ad); m; m = RATE.exec(ad)) {
    const amount = m[1] ?? m[4] ?? "";
    const unit = m[2] ?? m[3] ?? "";
    // "19.10 $900": a date followed by a prefixed price. The "$" belongs to the next number, so look again from there.
    if (m[1] && /^\d{1,2}[.,]\d{1,2}$/.test(amount) && /^[$€₽]$/.test(unit) && /^\s?\d/.test(ad.slice(m.index + m[0].length))) {
      RATE.lastIndex = m.index + amount.length;
      continue;
    }
    // thousands separators (space, comma, dot before exactly three digits) out, decimal comma to a dot
    const raw = amount.replace(/[ ,.](?=\d{3}(?!\d))/g, "").replace(",", ".");
    const rate = parseFloat(raw);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const cur = /^(у\.?\s?е\.?)$/i.test(unit) ? "USD" : normalizeCurrency(unit);
    if (cur) return { rate, currency: cur };
  }
  return null;
}

function parseLoadingDate(ad: string, now: Date): Date | null {
  // The first candidate that is a real calendar day and not a weight or a price ("20.5 т", "1.200$").
  const m = [...ad.matchAll(DATE)].find((c) => {
    const d = Number(c[1]);
    const mo = Number(c[2]);
    return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && !UNIT_AFTER.test(ad.slice(c.index + c[0].length));
  });
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : now.getUTCFullYear();
  if (y < 100) y += 2000;
  let date = new Date(Date.UTC(y, mo - 1, d, 8));
  // "12.01" typed in December means next year.
  if (!m[3] && date.getTime() < now.getTime() - 30 * 86_400_000) date = new Date(Date.UTC(y + 1, mo - 1, d, 8));
  return date;
}

export interface ParsedAd {
  text: string;
  listing: ParsedListing | null;
  problems: string[];
}

export function parseAd(text: string, idx: number, batch: string, now = new Date(), i18n?: I18n): ParsedAd {
  const { t } = i18n ?? englishI18n();
  const problems: string[] = [];
  const q = parseQueryRules(text, now, i18n);
  const f = q.filters;
  if (!f.origin) problems.push(t("parse.noOrigin"));
  if (!f.dest) problems.push(t("parse.noDest"));

  // \b is ASCII-only in JS, so Cyrillic units use an explicit Unicode letter lookahead.
  const tm = text.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:т|тонн\p{L}*|tons?|tonnes?|ton|t)(?!\p{L})/iu);
  const kg = text.match(/(\d{4,5})\s*(?:кг|kg)/i);
  const weight = tm ? Math.round(parseFloat(tm[1].replace(",", ".")) * 1000) : kg ? Number(kg[1]) : null;
  if (!weight) problems.push(t("parse.noWeight"));

  let loading = f.loadingFrom ? new Date(`${f.loadingFrom}T08:00:00Z`) : parseLoadingDate(stripPhone(text), now);
  // "Cargo ready" / "urgent" with no date means it can load now — the day the ad was posted.
  if (!loading && READY_NOW.test(text)) loading = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8));
  if (!loading) loading = null;
  if (!loading) problems.push(t("parse.noDate"));

  if (problems.length || !f.origin || !f.dest || !weight || !loading) return { text, listing: null, problems };

  const phone = findPhone(text);
  const rate = parseRate(stripPhone(text));
  const size = parseCargoSize(text);
  const pay = /предоплат|prepa/i.test(text) ? "prepaid" : /нал|на выгруз|по факту|cash/i.test(text) ? "on_unloading" : /на загруз/i.test(text) ? "on_loading" : undefined;
  return {
    text,
    problems,
    listing: {
      externalId: `${batch}-${idx + 1}`,
      origin: f.origin,
      destination: f.dest,
      loadingDate: loading,
      cargo: f.cargo?.[0]?.toLowerCase(),
      weight,
      weightUnit: "kg",
      bodyType: f.body?.[0]?.toLowerCase() ?? (/тент/i.test(text) ? "тент" : undefined),
      rate: rate?.rate ?? null,
      currency: rate?.currency,
      paymentTerms: pay,
      contactPhone: phone,
      contactEmail: findEmail(text),
      cargoLengthM: size.lengthM ?? null,
      cargoWidthM: size.widthM ?? null,
      cargoHeightM: size.heightM ?? null,
      oversize: size.oversize,
      adrClass: size.adrClass ?? null,
      postedAt: now,
      raw: { text },
    },
  };
}

export function parseAds(text: string, batch: string, now = new Date(), i18n?: I18n): ParsedAd[] {
  return splitAds(text).map((a, i) => parseAd(a, i, batch, now, i18n));
}
