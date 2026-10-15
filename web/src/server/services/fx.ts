import type { PrismaClient } from "@prisma/client";
import { parseCbuRates, setRates } from "../domain/currency";

/**
 * Exchange rates: the ExchangeRate table is the source of truth, refreshed daily from the Central
 * Bank of Uzbekistan. The in-memory table in domain/currency.ts is just a cache of it — before
 * this existed, nothing ever loaded the DB values, so ingestion always used the hard-coded defaults.
 */

const CBU_URL = process.env.CBU_RATES_URL ?? "https://cbu.uz/ru/arkhiv-kursov-valyut/json/";
export const CBU_SOURCE = "CBU.uz (Central Bank of Uzbekistan)";
const CACHE_MS = 10 * 60_000;
/** A rate that moves more than this in a single refresh is treated as a bad feed, not a real move. */
const MAX_JUMP = 0.25;

let loadedAt = 0;
let loading: Promise<void> | null = null;

/** Puts the DB rates into the in-memory table. Cheap to call often: it hits the DB at most every 10 min. */
export function loadRates(db: PrismaClient): Promise<void> {
  if (Date.now() - loadedAt < CACHE_MS) return Promise.resolve();
  loading ??= (async () => {
    try {
      const rows = await db.exchangeRate.findMany();
      if (rows.length) setRates(rows.map((r) => ({ currency: r.currency, perUsd: r.perUsd })));
      loadedAt = Date.now();
    } catch (e) {
      console.error("[fx] could not load rates, keeping what is in memory", e);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export interface FxRefreshResult {
  updated: string[];
  skipped: { currency: string; reason: string }[];
  asOf: string | null;
}

export async function refreshRatesFromCbu(db: PrismaClient): Promise<FxRefreshResult> {
  const res = await fetch(CBU_URL, {
    headers: { Accept: "application/json", "User-Agent": "Karvon/1.0 (freight platform; daily FX refresh)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`CBU answered ${res.status}`);
  const { rates, asOf } = parseCbuRates(await res.json());
  if (!rates.length) throw new Error("CBU response had no usable USD rate");

  const existing = new Map((await db.exchangeRate.findMany()).map((r) => [r.currency, r]));
  const out: FxRefreshResult = { updated: [], skipped: [], asOf: asOf?.toISOString().slice(0, 10) ?? null };
  for (const r of rates) {
    const prev = existing.get(r.currency);
    // Only compare against a previous CBU value: the seeded defaults are rough placeholders.
    if (prev && prev.source === CBU_SOURCE && Math.abs(r.perUsd / prev.perUsd - 1) > MAX_JUMP) {
      out.skipped.push({ currency: r.currency, reason: `moved ${prev.perUsd.toFixed(2)} → ${r.perUsd.toFixed(2)}, looks like a bad feed` });
      continue;
    }
    const data = { perUsd: r.perUsd, asOf: asOf ?? new Date(), source: CBU_SOURCE };
    await db.exchangeRate.upsert({ where: { currency: r.currency }, create: { currency: r.currency, ...data }, update: data });
    out.updated.push(r.currency);
  }
  loadedAt = 0; // pick the new values up on the next loadRates()
  await loadRates(db);
  return out;
}

/** Hours since the oldest CBU-sourced rate was published; null if rates were never fetched from CBU. */
export async function rateAgeHours(db: PrismaClient): Promise<number | null> {
  const rows = await db.exchangeRate.findMany({ where: { source: CBU_SOURCE }, select: { asOf: true } });
  if (!rows.length) return null;
  const oldest = Math.min(...rows.map((r) => r.asOf.getTime()));
  return (Date.now() - oldest) / 3_600_000;
}
