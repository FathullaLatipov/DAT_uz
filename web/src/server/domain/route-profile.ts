/**
 * Pure helpers for truck routing: the vehicle profile sent to the routing engine, the cache key,
 * path simplification and reading the engine's answer. No I/O, so all of it is unit-tested.
 */

export interface RouteProfile {
  heightM?: number;
  widthM?: number;
  lengthM?: number;
  /** Gross vehicle weight, tonnes. */
  weightT?: number;
  /** Heaviest axle, tonnes. */
  axleLoadT?: number;
  hazmat?: boolean;
}

export interface TruckDims {
  heightM?: number | null;
  widthM?: number | null;
  lengthM?: number | null;
  grossWeightKg?: number | null;
  axleLoadKg?: number | null;
}

const snap = (v: number, step: number) => Math.round(v / step) * step;
const pos = (n: number | null | undefined): n is number => typeof n === "number" && n > 0;

/** The routing profile for a truck; unknown dimensions are left out (the engine then applies none). Values are rounded so that near-identical trucks share cache entries. */
export function profileOf(t: TruckDims, hazmat: boolean): RouteProfile {
  const p: RouteProfile = {};
  if (pos(t.heightM)) p.heightM = +snap(t.heightM, 0.05).toFixed(2);
  if (pos(t.widthM)) p.widthM = +snap(t.widthM, 0.05).toFixed(2);
  if (pos(t.lengthM)) p.lengthM = +snap(t.lengthM, 0.5).toFixed(1);
  if (pos(t.grossWeightKg)) p.weightT = +snap(t.grossWeightKg / 1000, 0.5).toFixed(1);
  if (pos(t.axleLoadKg)) p.axleLoadT = +snap(t.axleLoadKg / 1000, 0.5).toFixed(1);
  if (hazmat) p.hazmat = true;
  return p;
}

export const hasDimensions = (p: RouteProfile) => p.heightM != null || p.widthM != null || p.lengthM != null || p.weightT != null || p.axleLoadT != null;

export const profileKey = (p: RouteProfile) =>
  `h${p.heightM ?? "-"}_w${p.widthM ?? "-"}_l${p.lengthM ?? "-"}_g${p.weightT ?? "-"}_a${p.axleLoadT ?? "-"}_hz${p.hazmat ? 1 : 0}`;

export interface LatLng { lat: number; lng: number }
const r2 = (n: number) => n.toFixed(2);
export const legKey = (from: LatLng, to: LatLng, p: RouteProfile) => `ors:${r2(from.lat)},${r2(from.lng)}>${r2(to.lat)},${r2(to.lng)}|${profileKey(p)}`;

/** `options.profile_params.restrictions` of an OpenRouteService driving-hgv request. */
export function orsRestrictions(p: RouteProfile) {
  const r: Record<string, number | boolean> = {};
  if (p.heightM != null) r.height = p.heightM;
  if (p.widthM != null) r.width = p.widthM;
  if (p.lengthM != null) r.length = p.lengthM;
  if (p.weightT != null) r.weight = p.weightT;
  if (p.axleLoadT != null) r.axleload = p.axleLoadT;
  if (p.hazmat) r.hazmat = true;
  return r;
}

export type Pt = [number, number];

/** Douglas–Peucker (iterative, so a long path cannot overflow the stack). Tolerance in degrees. */
export function simplifyPath(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4] as Pt);
}

export interface ParsedRoute { km: number; minutes: number; path: Pt[]; tollShare: number | null }

/** Reads an OpenRouteService GeoJSON directions answer; null when it has no usable route. */
export function parseOrsRoute(json: unknown): ParsedRoute | null {
  const f = (json as { features?: { geometry?: { coordinates?: unknown }; properties?: { summary?: { distance?: number; duration?: number }; extras?: { tollways?: { values?: [number, number, number][] } }; segments?: unknown } }[] })?.features?.[0];
  const coords = f?.geometry?.coordinates;
  const sum = f?.properties?.summary;
  if (!Array.isArray(coords) || coords.length < 2 || !sum?.distance || !sum.duration) return null;
  const pts = coords.filter((c): c is Pt => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number").map((c) => [c[0], c[1]] as Pt);
  if (pts.length < 2) return null;
  const tw = f?.properties?.extras?.tollways?.values;
  const total = pts.length - 1;
  const tolled = Array.isArray(tw) ? tw.filter((v) => v[2] === 1).reduce((s, v) => s + Math.max(0, v[1] - v[0]), 0) : null;
  return {
    km: Math.round(sum.distance / 100) / 10,
    minutes: Math.round(sum.duration / 60),
    path: simplifyPath(pts, 0.002),
    tollShare: tolled == null ? null : Math.min(1, Math.round((tolled / total) * 100) / 100),
  };
}

export type RouteFailure = "NO_ROUTE" | "BAD_KEY" | "LIMIT" | "BUSY" | "FAILED";

/** What a non-200 answer of the engine means. NO_ROUTE (no road fits this truck, or a point is off the map) is a stable answer worth caching. */
export function orsFailure(status: number, body: unknown): RouteFailure {
  const code = (body as { error?: { code?: number } })?.error?.code;
  if (status === 401 || status === 403) return "BAD_KEY";
  if (status === 429) return "LIMIT";
  if (status === 404 || code === 2009 || code === 2010 || code === 2004 || code === 2003) return "NO_ROUTE";
  if (status >= 500 || status === 408) return "BUSY";
  return "FAILED";
}

type LegLike = { ok: true; km: number } | { ok: false } | null | undefined;

/**
 * Distances for the profit maths: the routed ones where the routing service answered, the table estimates otherwise.
 * `routed` is true only when the loaded leg is a real route, so a screen can say which basis it shows.
 */
export function distancesFor(loaded: LegLike, empty: LegLike, fallback: { loadedKm: number; deadheadKm: number }) {
  if (!loaded || !loaded.ok) return { loadedKm: fallback.loadedKm, deadheadKm: fallback.deadheadKm, routed: false };
  return { loadedKm: loaded.km, deadheadKm: empty && empty.ok ? empty.km : fallback.deadheadKm, routed: true };
}
