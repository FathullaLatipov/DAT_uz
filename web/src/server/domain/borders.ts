/**
 * Border crossings on a freight corridor: which land borders a truck passes between two countries, the typical
 * time they cost and what to have ready. Planning figures, not live queues: waits at these crossings swing from
 * hours to days, so every crossing carries a low–high range and the screens say so.
 */

import { tripTime } from "./hos";

export type BorderDoc = "CMR" | "TIR" | "TRANSIT";

export interface BorderEdge {
  a: string;
  b: string;
  /** Typical total time at the crossing for a truck (queue + procedures), hours: low … high. */
  hoursLow: number;
  hoursHigh: number;
  /** Eurasian Economic Union internal border: no customs control between members. */
  eaeu?: boolean;
}

/** Land borders trucks use between the countries Karvon covers. */
export const BORDER_EDGES: BorderEdge[] = [
  { a: "UZ", b: "KZ", hoursLow: 8, hoursHigh: 36 },
  { a: "UZ", b: "KG", hoursLow: 4, hoursHigh: 24 },
  { a: "UZ", b: "TJ", hoursLow: 4, hoursHigh: 24 },
  { a: "UZ", b: "TM", hoursLow: 12, hoursHigh: 48 },
  { a: "KZ", b: "KG", hoursLow: 2, hoursHigh: 12, eaeu: true },
  { a: "KZ", b: "RU", hoursLow: 2, hoursHigh: 12, eaeu: true },
  { a: "KZ", b: "CN", hoursLow: 24, hoursHigh: 96 },
  { a: "KG", b: "CN", hoursLow: 24, hoursHigh: 72 },
  { a: "KG", b: "TJ", hoursLow: 4, hoursHigh: 24 },
  { a: "TJ", b: "CN", hoursLow: 24, hoursHigh: 72 },
  { a: "RU", b: "BY", hoursLow: 0, hoursHigh: 2, eaeu: true },
  { a: "RU", b: "GE", hoursLow: 24, hoursHigh: 72 },
  { a: "RU", b: "AZ", hoursLow: 12, hoursHigh: 48 },
  { a: "GE", b: "AZ", hoursLow: 6, hoursHigh: 24 },
  { a: "GE", b: "AM", hoursLow: 4, hoursHigh: 12 },
  { a: "GE", b: "TR", hoursLow: 6, hoursHigh: 24 },
];

/** Planning estimate of official fees and permits per crossing, USD (the long-standing flat value of the profit estimate). */
export const CROSSING_FEE_USD = 40;

export interface Crossing {
  from: string;
  to: string;
  hoursLow: number;
  hoursHigh: number;
  feeUsd: number;
  docs: BorderDoc[];
}

const mid = (e: BorderEdge) => (e.hoursLow + e.hoursHigh) / 2;
const neighbours = new Map<string, { to: string; edge: BorderEdge }[]>();
for (const e of BORDER_EDGES) {
  (neighbours.get(e.a) ?? neighbours.set(e.a, []).get(e.a)!).push({ to: e.b, edge: e });
  (neighbours.get(e.b) ?? neighbours.set(e.b, []).get(e.b)!).push({ to: e.a, edge: e });
}

const memo = new Map<string, Crossing[]>();

/** The crossings on the quickest land corridor (least typical border time) from one country to another; none inside a country or when no corridor is known. */
export function crossingsBetween(from: string, to: string): Crossing[] {
  if (from === to) return [];
  const key = `${from}>${to}`;
  const hit = memo.get(key);
  if (hit) return hit;
  // Dijkstra over a dozen countries.
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { country: string; edge: BorderEdge }>();
  const todo = new Set<string>([from]);
  while (todo.size) {
    let u = "";
    for (const c of todo) if (u === "" || dist.get(c)! < dist.get(u)!) u = c;
    todo.delete(u);
    for (const { to: v, edge } of neighbours.get(u) ?? []) {
      const nd = dist.get(u)! + mid(edge) + 1; // +1: fewer crossings win a tie
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, { country: u, edge });
        todo.add(v);
      }
    }
  }
  const out: Crossing[] = [];
  for (let c = to; c !== from && prev.has(c); ) {
    const { country, edge } = prev.get(c)!;
    out.unshift({
      from: country,
      to: c,
      hoursLow: edge.hoursLow,
      hoursHigh: edge.hoursHigh,
      feeUsd: edge.eaeu ? 0 : CROSSING_FEE_USD,
      docs: edge.eaeu ? ["CMR"] : ["CMR", "TIR", "TRANSIT"],
    });
    c = country;
  }
  const res = prev.has(to) ? out : [];
  memo.set(key, res);
  return res;
}

export interface BorderSummary { crossings: Crossing[]; hoursLow: number; hoursHigh: number; feeUsd: number }

export function borderSummary(from: string, to: string): BorderSummary {
  const crossings = crossingsBetween(from, to);
  return {
    crossings,
    hoursLow: crossings.reduce((s, c) => s + c.hoursLow, 0),
    hoursHigh: crossings.reduce((s, c) => s + c.hoursHigh, 0),
    feeUsd: crossings.reduce((s, c) => s + c.feeUsd, 0),
  };
}

/** Typical border time of the corridor, hours (the middle of each crossing's range). */
export function typicalBorderHours(from: string, to: string) {
  const s = borderSummary(from, to);
  return (s.hoursLow + s.hoursHigh) / 2;
}

/** Days for a trip: driving under driver-hours rules plus the typical border time, rounded up. Inside one country this is just the driving. */
export function transitDaysWithBorders(km: number, from: string, to: string, crew = 1, drivingMinutes?: number | null) {
  return tripTime({ km, drivingMinutes, crew, borderH: typicalBorderHours(from, to) }).days;
}
