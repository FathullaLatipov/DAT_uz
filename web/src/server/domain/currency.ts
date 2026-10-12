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
