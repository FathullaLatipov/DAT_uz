/**
 * Deterministic profitability maths. No LLM is ever involved in money calculations.
 * All amounts in USD.
 */

export interface CostProfile {
  fuelLPer100km: number;
  fuelPriceUsd: number;
  driverCostPerKm: number;
  maintenancePerKm: number;
  otherPerTripUsd: number;
}

export interface ProfitInput extends CostProfile {
  revenueUsd: number;
  loadedKm: number;
  deadheadKm: number;
  tollsUsd: number;
}

export interface ProfitBreakdown {
  revenue: number;
  fuel: number;
  driver: number;
  maintenance: number;
  tolls: number;
  other: number;
  totalCost: number;
  profit: number;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  emptyPct: number;
  ratePerLoadedKm: number;
  profitPerKm: number; // per total km driven
  margin: number; // 0..1
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeProfit(i: ProfitInput): ProfitBreakdown {
  const totalKm = Math.max(0, i.loadedKm) + Math.max(0, i.deadheadKm);
  const fuel = (totalKm * i.fuelLPer100km * i.fuelPriceUsd) / 100;
  const driver = totalKm * i.driverCostPerKm;
  const maintenance = totalKm * i.maintenancePerKm;
  const tolls = i.tollsUsd;
  const other = i.otherPerTripUsd;
  const totalCost = fuel + driver + maintenance + tolls + other;
  const profit = i.revenueUsd - totalCost;
  return {
    revenue: r2(i.revenueUsd),
    fuel: r2(fuel),
    driver: r2(driver),
    maintenance: r2(maintenance),
    tolls: r2(tolls),
    other: r2(other),
    totalCost: r2(totalCost),
    profit: r2(profit),
    totalKm: Math.round(totalKm),
    loadedKm: Math.round(i.loadedKm),
    emptyKm: Math.round(i.deadheadKm),
    emptyPct: totalKm > 0 ? i.deadheadKm / totalKm : 0,
    ratePerLoadedKm: i.loadedKm > 0 ? r2(i.revenueUsd / i.loadedKm) : 0,
    profitPerKm: totalKm > 0 ? r2(profit / totalKm) : 0,
    margin: i.revenueUsd > 0 ? profit / i.revenueUsd : 0,
  };
}

/**
 * ESTIMATED road charges per loaded km by country (USD). Rough planning values — e.g. Russia's
 * Platon system for >12 t trucks, Chinese expressway tolls, Turkish motorways. Override per trip
 * in the calculator when actual costs are known.
 */
export const TOLL_PER_KM_USD: Record<string, number> = {
  UZ: 0.01, KZ: 0.02, KG: 0.01, TJ: 0.01, TM: 0.02, RU: 0.035, BY: 0.06, AZ: 0.01, GE: 0.01, AM: 0.01, TR: 0.08, CN: 0.14,
};

export function estimateTollsUsd(loadedKm: number, originCountry: string, destCountry: string) {
  const a = TOLL_PER_KM_USD[originCountry] ?? 0.02;
  const b = TOLL_PER_KM_USD[destCountry] ?? 0.02;
  const crossings = originCountry === destCountry ? 0 : 1;
  // Border crossing fees/permits: flat planning estimate per crossing.
  return r2(loadedKm * ((a + b) / 2) + crossings * 40);
}

export const DEFAULT_COST_PROFILE: CostProfile = {
  fuelLPer100km: 32,
  fuelPriceUsd: 0.95,
  driverCostPerKm: 0.22,
  maintenancePerKm: 0.08,
  otherPerTripUsd: 20,
};
