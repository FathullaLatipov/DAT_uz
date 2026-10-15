import type { Currency } from "./enums";

/**
 * Reference FX table (units per 1 USD). These are MANUAL REFERENCE VALUES used only to
 * compare offers in a common unit — the original amount and currency are always stored
 * and displayed alongside. Replace with a live FX provider (e.g. CBU.uz daily rates) via
 * the ExchangeRate table; `setRates` is called on boot with DB values.
 */
const DEFAULT_PER_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  RUB: 92,
  KZT: 505,
  CNY: 7.2,
  UZS: 12_650,
};

let perUsd: Record<string, number> = { ...DEFAULT_PER_USD };

export function setRates(rates: { currency: string; perUsd: number }[]) {
  perUsd = { ...DEFAULT_PER_USD };
  for (const r of rates) if (r.perUsd > 0) perUsd[r.currency] = r.perUsd;
}

export const defaultRates = () => ({ ...DEFAULT_PER_USD });

export interface CbuRatesResult {
  rates: { currency: string; perUsd: number }[];
  /** Date the Central Bank published these rates for. */
  asOf: Date | null;
}

/**
 * Turns the Central Bank of Uzbekistan's daily JSON (https://cbu.uz/ru/arkhiv-kursov-valyut/json/)
 * into "units of currency per 1 USD". CBU quotes every currency in UZS per `Nominal` units, so
 * perUsd(X) = (UZS per USD) / (UZS per 1 X). Only currencies we price loads in are returned;
 * anything malformed is skipped rather than guessed.
 */
export function parseCbuRates(payload: unknown, wanted: readonly string[] = Object.keys(DEFAULT_PER_USD)): CbuRatesResult {
  const rows = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
  const uzsPer = new Map<string, number>(); // UZS for ONE unit of the currency
  let asOf: Date | null = null;
  for (const r of rows) {
    const ccy = typeof r.Ccy === "string" ? r.Ccy.toUpperCase() : "";
    const rate = Number(r.Rate);
    const nominal = Number(r.Nominal ?? 1) || 1;
    if (!ccy || !Number.isFinite(rate) || rate <= 0) continue;
    uzsPer.set(ccy, rate / nominal);
    const m = typeof r.Date === "string" ? r.Date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/) : null;
    if (m && !asOf) asOf = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  }
  const usd = uzsPer.get("USD");
  if (!usd) return { rates: [], asOf };
  const rates: { currency: string; perUsd: number }[] = [];
  for (const c of wanted) {
    if (c === "USD") rates.push({ currency: "USD", perUsd: 1 });
    else if (c === "UZS") rates.push({ currency: "UZS", perUsd: usd });
    else {
      const per = uzsPer.get(c);
      if (per) rates.push({ currency: c, perUsd: usd / per });
    }
  }
  return { rates, asOf };
}

export function toUsd(amount: number, currency: string): number {
  const r = perUsd[currency];
  if (!r) throw new Error(`No FX rate for ${currency}`);
  return amount / r;
}

export function fromUsd(amountUsd: number, currency: string): number {
  const r = perUsd[currency];
  if (!r) throw new Error(`No FX rate for ${currency}`);
  return amountUsd * r;
}
