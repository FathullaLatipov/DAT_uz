/**
 * Diesel pricing by country for the profit estimate. Pure: the table comes from the database (admin-edited),
 * these defaults are only the fallback when a country has no row.
 */

/** USD per litre, planning estimates. */
export const DEFAULT_FUEL_USD: Record<string, number> = {
  UZ: 0.95, KZ: 0.6, KG: 0.85, TJ: 1.05, TM: 0.3, RU: 0.8, BY: 0.85, AZ: 0.65, TR: 1.4, CN: 1.0, GE: 1.2, AM: 1.1,
};

export type FuelTable = Record<string, number>;

const priceIn = (table: FuelTable, country: string | undefined, fallback: number) => (country && table[country] > 0 ? table[country] : (country && DEFAULT_FUEL_USD[country]) || fallback);

/**
 * The fuel price to cost a trip with: the empty drive to the pickup is fuelled where the truck stands, the loaded
 * drive at the average of the two end countries' prices (half of it is driven in each, as a planning approximation),
 * all weighted by kilometres.
 */
export function effectiveFuelPrice(o: { truckCountry?: string; originCountry: string; destCountry: string; deadheadKm: number; loadedKm: number; table: FuelTable; fallback: number }) {
  const dead = Math.max(0, o.deadheadKm);
  const loaded = Math.max(0, o.loadedKm);
  const total = dead + loaded;
  const atOrigin = priceIn(o.table, o.originCountry, o.fallback);
  const atDest = priceIn(o.table, o.destCountry, o.fallback);
  const loadedPrice = (atOrigin + atDest) / 2;
  if (total === 0) return Math.round(loadedPrice * 1000) / 1000;
  const deadPrice = priceIn(o.table, o.truckCountry ?? o.originCountry, o.fallback);
  return Math.round(((dead * deadPrice + loaded * loadedPrice) / total) * 1000) / 1000;
}
