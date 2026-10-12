/**
 * DEMO DATA GENERATOR.
 * Produces fictional freight for development. Every company name is invented, no contact
 * details are generated, and every record lands in the DB with isDemo = true.
 * Deterministic (seeded PRNG) so the same "market" is produced on every reseed.
 */
import { estimateRoadKm, getCity } from "../../domain/geo";
import type { BodyType, CargoType, Currency, PaymentTerm } from "../../domain/enums";
import { fromUsd } from "../../domain/currency";

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_BROKERS = [
  "Caravan Bridge Logistics",
  "Amu Darya Freight",
  "Zarafshan Cargo Lines",
  "Tien Shan Forwarding",
  "Steppe Link Transport",
  "Fergana Valley Express",
  "Aral Route Logistics",
  "Registan Freight Partners",
  "Chimgan Trade House",
  "Kyzylkum Haulage",
  "Pamir Gate Logistics",
  "Orient Corridor Group",
  "Navbahor Agro Export",
  "Bright Loom Textile Export",
  "Samarkand Stoneworks",
  "Turan Supply Chain",
  "Oasis Cold Chain",
  "Northern Steppe Metals",
  "Golden Valley Produce",
  "Altyn Kopir Forwarding",
];

interface Lane {
  o: string;
  d: string;
  w: number; // relative frequency
  perKm: number; // base USD/km
  trend: number; // fractional change over 45 days (recent vs old)
  cargo: CargoType[];
}

// Rates are invented for demo purposes and loosely shaped by distance (short hauls pay more per km).
const LANES: Lane[] = [
  { o: "tashkent", d: "almaty", w: 9, perKm: 1.45, trend: 0.09, cargo: ["TEXTILES", "FOOD", "GENERAL", "CONSTRUCTION"] },
  { o: "almaty", d: "tashkent", w: 6, perKm: 1.25, trend: 0.04, cargo: ["FOOD", "METAL", "GENERAL", "EQUIPMENT"] },
  { o: "tashkent", d: "bishkek", w: 5, perKm: 1.5, trend: 0.06, cargo: ["FOOD", "TEXTILES", "GENERAL"] },
  { o: "tashkent", d: "astana", w: 4, perKm: 1.3, trend: 0.05, cargo: ["PRODUCE", "TEXTILES", "FOOD"] },
  { o: "tashkent", d: "moscow", w: 7, perKm: 1.12, trend: 0.07, cargo: ["PRODUCE", "TEXTILES", "COTTON", "FOOD"] },
  { o: "fergana", d: "moscow", w: 5, perKm: 1.15, trend: 0.11, cargo: ["PRODUCE", "TEXTILES"] },
  { o: "samarkand", d: "moscow", w: 4, perKm: 1.1, trend: 0.06, cargo: ["PRODUCE", "FOOD"] },
  { o: "andijan", d: "yekaterinburg", w: 3, perKm: 1.12, trend: 0.03, cargo: ["PRODUCE", "TEXTILES"] },
  { o: "tashkent", d: "kazan", w: 2, perKm: 1.1, trend: 0.02, cargo: ["TEXTILES", "GENERAL"] },
  { o: "urumqi", d: "tashkent", w: 5, perKm: 1.55, trend: 0.08, cargo: ["ELECTRONICS", "EQUIPMENT", "GENERAL", "CONSTRUCTION"] },
  { o: "kashgar", d: "andijan", w: 4, perKm: 1.75, trend: 0.1, cargo: ["ELECTRONICS", "EQUIPMENT", "GENERAL"] },
  { o: "istanbul", d: "tashkent", w: 3, perKm: 1.25, trend: 0.03, cargo: ["FURNITURE", "EQUIPMENT", "CHEMICALS", "GENERAL"] },
  { o: "tashkent", d: "dushanbe", w: 3, perKm: 1.6, trend: 0.02, cargo: ["FOOD", "CONSTRUCTION", "GENERAL"] },
  { o: "termez", d: "tashkent", w: 3, perKm: 1.35, trend: -0.04, cargo: ["FOOD", "CONSTRUCTION"] },
  { o: "tashkent", d: "samarkand", w: 6, perKm: 1.7, trend: 0.03, cargo: ["FOOD", "CONSTRUCTION", "GENERAL", "FURNITURE"] },
  { o: "samarkand", d: "tashkent", w: 4, perKm: 1.55, trend: 0.01, cargo: ["PRODUCE", "CONSTRUCTION", "FOOD"] },
  { o: "tashkent", d: "fergana", w: 4, perKm: 1.75, trend: 0.05, cargo: ["FOOD", "CONSTRUCTION", "GENERAL"] },
  { o: "andijan", d: "tashkent", w: 3, perKm: 1.65, trend: 0.02, cargo: ["PRODUCE", "TEXTILES", "VEHICLES"] },
  { o: "bukhara", d: "tashkent", w: 3, perKm: 1.5, trend: 0.04, cargo: ["COTTON", "TEXTILES", "CONSTRUCTION"] },
  { o: "navoi", d: "tashkent", w: 2, perKm: 1.55, trend: 0.0, cargo: ["METAL", "CONSTRUCTION", "CHEMICALS"] },
  { o: "tashkent", d: "nukus", w: 2, perKm: 1.4, trend: -0.02, cargo: ["FOOD", "CONSTRUCTION"] },
  { o: "urgench", d: "tashkent", w: 2, perKm: 1.4, trend: 0.01, cargo: ["COTTON", "PRODUCE"] },
  { o: "qarshi", d: "tashkent", w: 2, perKm: 1.45, trend: 0.03, cargo: ["FUEL", "CHEMICALS", "FOOD"] },
  { o: "tashkent", d: "baku", w: 2, perKm: 1.2, trend: 0.05, cargo: ["TEXTILES", "FOOD"] },
  { o: "tashkent", d: "tbilisi", w: 1, perKm: 1.18, trend: 0.04, cargo: ["TEXTILES", "PRODUCE"] },
  { o: "tashkent", d: "minsk", w: 1, perKm: 1.08, trend: 0.02, cargo: ["TEXTILES", "PRODUCE"] },
  { o: "samarkand", d: "ashgabat", w: 1, perKm: 1.35, trend: 0.0, cargo: ["FOOD", "CONSTRUCTION"] },
  { o: "shymkent", d: "tashkent", w: 3, perKm: 1.6, trend: 0.04, cargo: ["FOOD", "CONSTRUCTION", "METAL"] },
  { o: "bishkek", d: "tashkent", w: 2, perKm: 1.4, trend: 0.03, cargo: ["FOOD", "GENERAL"] },
  { o: "namangan", d: "almaty", w: 2, perKm: 1.4, trend: 0.07, cargo: ["PRODUCE", "TEXTILES"] },
  { o: "jizzakh", d: "almaty", w: 1, perKm: 1.42, trend: 0.05, cargo: ["PRODUCE", "FOOD"] },
  { o: "gulistan", d: "moscow", w: 1, perKm: 1.1, trend: 0.04, cargo: ["PRODUCE", "COTTON"] },
  { o: "tashkent", d: "yerevan", w: 1, perKm: 1.15, trend: 0.01, cargo: ["TEXTILES"] },
];

const BODY_FOR_CARGO: Record<CargoType, BodyType[]> = {
  PRODUCE: ["REFRIGERATED", "REFRIGERATED", "REFRIGERATED", "CURTAINSIDER"],
  FOOD: ["CURTAINSIDER", "BOX", "REFRIGERATED"],
  TEXTILES: ["CURTAINSIDER", "BOX"],
  COTTON: ["CURTAINSIDER", "OPEN"],
  CONSTRUCTION: ["CURTAINSIDER", "OPEN", "FLATBED"],
  EQUIPMENT: ["CURTAINSIDER", "FLATBED", "LOWBED"],
  CHEMICALS: ["CURTAINSIDER", "TANKER"],
  FUEL: ["TANKER"],
  VEHICLES: ["CAR_CARRIER"],
  ELECTRONICS: ["BOX", "CURTAINSIDER", "CONTAINER"],
  FURNITURE: ["CURTAINSIDER", "BOX"],
  METAL: ["FLATBED", "OPEN", "CURTAINSIDER"],
  GENERAL: ["CURTAINSIDER", "CURTAINSIDER", "BOX"],
};

const PAYMENT: PaymentTerm[] = ["ON_UNLOADING", "ON_UNLOADING", "ON_LOADING", "PREPAID", "NET_7", "NET_14", "NET_30"];

export interface DemoLoad {
  key: string;
  origin: string;
  dest: string;
  postedAt: Date;
  loadingDate: Date;
  unloadingDate: Date;
  cargo: CargoType;
  weightKg: number;
  volumeM3: number;
  body: BodyType;
  rateUsd: number;
  currency: Currency;
  rate: number;
  payment: PaymentTerm;
  broker: string;
  channels: ("A" | "B" | "CSV")[];
}

const DAY = 86_400_000;

function pickWeighted<T extends { w: number }>(rnd: () => number, items: T[]): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rnd() * total;
  for (const i of items) if ((r -= i.w) <= 0) return i;
  return items[items.length - 1];
}
const pick = <T,>(rnd: () => number, arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

function currencyFor(rnd: () => number, o: string, d: string): Currency {
  const oc = getCity(o)!.country;
  const dc = getCity(d)!.country;
  const r = rnd();
  if (oc === "UZ" && dc === "UZ") return r < 0.55 ? "UZS" : "USD";
  if (dc === "RU" || oc === "RU") return r < 0.3 ? "RUB" : "USD";
  if (dc === "KZ" || oc === "KZ") return r < 0.2 ? "KZT" : "USD";
  if (oc === "CN") return r < 0.25 ? "CNY" : "USD";
  if (oc === "TR") return r < 0.35 ? "EUR" : "USD";
  return "USD";
}

/** Round to how people actually quote prices in each currency. */
function roundPrice(v: number, c: Currency) {
  const step = c === "UZS" ? 50_000 : c === "KZT" ? 5_000 : c === "RUB" ? 1_000 : c === "CNY" ? 50 : 10;
  return Math.round(v / step) * step;
}

export function generateDemoLoads(now: Date, opts = { active: 140, historical: 640, seed: 20261008 }): DemoLoad[] {
  const rnd = mulberry32(opts.seed);
  const loads: DemoLoad[] = [];
  const total = opts.active + opts.historical;

  for (let i = 0; i < total; i++) {
    const isActive = i < opts.active;
    const lane = pickWeighted(rnd, LANES);
    const km = estimateRoadKm(lane.o, lane.d);
    // Active loads were posted over the last 5 days; history spreads evenly over the 40 days before.
    const ageDays = isActive ? rnd() * 5 : 5 + rnd() * 40;
    const postedAt = new Date(now.getTime() - ageDays * DAY);
    const loadingDate = new Date(
      isActive ? now.getTime() + Math.floor(rnd() * 9) * DAY + (8 + Math.floor(rnd() * 8)) * 3_600_000 : postedAt.getTime() + (1 + Math.floor(rnd() * 3)) * DAY,
    );
    loadingDate.setMinutes(0, 0, 0);
    const transitDays = Math.max(1, Math.ceil(km / 550));
    const unloadingDate = new Date(loadingDate.getTime() + transitDays * DAY);

    const cargo = pick(rnd, lane.cargo);
    const body = pick(rnd, BODY_FOR_CARGO[cargo]);
    const weightKg = Math.round((cargo === "VEHICLES" ? 8 + rnd() * 8 : 6 + rnd() * 16) * 2) * 500;
    const volumeM3 = body === "TANKER" ? 30 : Math.round(40 + (weightKg / 22000) * 50 + rnd() * 10);

    const recency = 1 - ageDays / 45; // 0 (old) … 1 (now)
    const reefer = body === "REFRIGERATED" ? 1.12 : 1;
    const perKm = lane.perKm * reefer * (1 - lane.trend / 2 + lane.trend * recency) * (0.88 + rnd() * 0.24);
    const rateUsd = Math.max(220, km * perKm);
    const currency = currencyFor(rnd, lane.o, lane.d);
    const rate = roundPrice(fromUsd(rateUsd, currency), currency);

    const r = rnd();
    const channels: DemoLoad["channels"] =
      r < 0.42 ? ["A"] : r < 0.72 ? ["B"] : r < 0.93 ? ["A", "B"] : r < 0.97 ? ["CSV"] : ["A", "B", "CSV"];

    loads.push({
      key: `L${(i + 1).toString().padStart(4, "0")}`,
      origin: lane.o,
      dest: lane.d,
      postedAt,
      loadingDate,
      unloadingDate,
      cargo,
      weightKg,
      volumeM3,
      body,
      rateUsd,
      currency,
      rate,
      payment: pick(rnd, PAYMENT),
      broker: pick(rnd, DEMO_BROKERS),
      channels,
    });
  }
  return loads;
}
