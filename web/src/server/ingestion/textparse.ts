import { parseQueryRules } from "../ai/nlsearch";
import { normalizeCurrency } from "./normalize";
import type { ParsedListing } from "./types";

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
const stripPhone = (text: string) => {
  const p = findPhone(text);
  return p ? text.replace(p, " ") : text;
};
const DATE = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/;
// Number = digits with optional thousands groups ("5 000 000", "1,300", "1300.50"); no nested
// quantifiers over the same characters, so pasted input can't trigger catastrophic backtracking.
const NUM = String.raw`\d{1,3}(?:[ ,]\d{3}){1,3}(?:[.,]\d{1,2})?|\d{1,9}(?:[.,]\d{1,2})?`;
const RATE = new RegExp(String.raw`(${NUM})\s?(\$|usd|долл\w*|у\.?\s?е\.?|eur|€|евро|rub|руб\w*|₽|kzt|тенге|₸|cny|юан\w*|uzs|сум\w*|so['’]?m)|(\$|€|₽)\s?(${NUM})`, "i");

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
  const m = ad.match(RATE);
  if (!m) return null;
  const raw = (m[1] ?? m[4] ?? "").replace(/[ ,](?=\d{3}\b)/g, "").replace(",", ".");
  const unit = m[2] ?? m[3] ?? "";
  const rate = parseFloat(raw);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const cur = /^(у\.?\s?е\.?)$/i.test(unit) ? "USD" : normalizeCurrency(unit);
  return cur ? { rate, currency: cur } : null;
}

function parseLoadingDate(ad: string, now: Date): Date | null {
  const m = ad.match(DATE);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
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

export function parseAd(text: string, idx: number, batch: string, now = new Date()): ParsedAd {
  const problems: string[] = [];
  const q = parseQueryRules(text, now);
  const f = q.filters;
  if (!f.origin) problems.push("Could not find the origin city");
  if (!f.dest) problems.push("Could not find the destination city");

  // \b is ASCII-only in JS, so Cyrillic units use an explicit Unicode letter lookahead.
  const tm = text.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:т|тонн\p{L}*|tons?|tonnes?|ton|t)(?!\p{L})/iu);
  const kg = text.match(/(\d{4,5})\s*(?:кг|kg)/i);
  const weight = tm ? Math.round(parseFloat(tm[1].replace(",", ".")) * 1000) : kg ? Number(kg[1]) : null;
  if (!weight) problems.push("Could not find the weight (e.g. “20 т”)");

  let loading = f.loadingFrom ? new Date(`${f.loadingFrom}T08:00:00Z`) : parseLoadingDate(stripPhone(text), now);
  if (!loading) loading = null;
  if (!loading) problems.push("Could not find the loading date (e.g. “12.10”, “завтра”)");

  if (problems.length || !f.origin || !f.dest || !weight || !loading) return { text, listing: null, problems };

  const phone = findPhone(text);
  const rate = parseRate(stripPhone(text));
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
      postedAt: now,
      raw: { text },
    },
  };
}

export function parseAds(text: string, batch: string, now = new Date()): ParsedAd[] {
  return splitAds(text).map((a, i) => parseAd(a, i, batch, now));
}
