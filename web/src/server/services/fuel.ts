import { db } from "../db";
import { DEFAULT_FUEL_USD, type FuelTable } from "../domain/fuel";

const TTL_MS = 60_000;
let cache: { at: number; table: FuelTable } | null = null;

/** The diesel price table (USD/L by country), one query a minute at most; missing countries fall back to the built-in defaults. */
export async function fuelTable(): Promise<FuelTable> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.table;
  const rows = await db.fuelPrice.findMany();
  const table: FuelTable = { ...DEFAULT_FUEL_USD };
  for (const r of rows) table[r.country] = r.priceUsd;
  cache = { at: Date.now(), table };
  return table;
}

export function invalidateFuelTable() {
  cache = null;
}
