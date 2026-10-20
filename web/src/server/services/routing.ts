import "server-only";
import { db } from "../db";
import { freshGps, getCity } from "../domain/geo";
import { needsAdr } from "../domain/fit";
import { legKey, orsFailure, orsRestrictions, parseOrsRoute, profileOf, type LatLng, type Pt, type RouteFailure, type RouteProfile, type TruckDims } from "../domain/route-profile";

/**
 * Truck routing through OpenRouteService (driving-hgv profile: height, width, length, weight, axle load, ADR).
 * Every answer is cached in the database by origin, destination and truck profile; the service has a daily and a
 * per-minute allowance, which this module keeps well inside of. Without ORS_API_KEY the feature is simply off.
 */

const ENDPOINT = process.env.ORS_URL ?? "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson";
const DAY = 86_400_000;
const OK_TTL = 30 * DAY;
const NO_ROUTE_TTL = DAY;
/** The free plan allows 2,000 directions a day and 40 a minute; stay below both. */
const dailyCap = () => Number(process.env.ORS_DAILY_CAP) || 1500;
const MINUTE_CAP = 30;

export const routingEnabled = () => !!process.env.ORS_API_KEY;

export type RouteLeg =
  | { ok: true; km: number; minutes: number; path: Pt[]; tollShare: number | null }
  | { ok: false; reason: RouteFailure };

const recent: number[] = [];
const inflight = new Map<string, Promise<RouteLeg>>();

function throttled(now: number) {
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= MINUTE_CAP) return true;
  recent.push(now);
  return false;
}

async function underDailyCap(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return (await db.routeCache.count({ where: { source: "ors", createdAt: { gte: start } } })) < dailyCap();
}

async function fetchLeg(from: LatLng, to: LatLng, profile: RouteProfile): Promise<RouteLeg> {
  const restrictions = orsRestrictions(profile);
  const body = {
    coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    // Cities are points in the middle of town: let the engine snap them to the nearest road however far.
    radiuses: [-1, -1],
    instructions: false,
    extra_info: ["tollways"],
    ...(Object.keys(restrictions).length ? { options: { profile_params: { restrictions } } } : {}),
  };
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: process.env.ORS_API_KEY!, "Content-Type": "application/json", Accept: "application/geo+json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "BUSY" };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, reason: orsFailure(res.status, json) };
  const r = parseOrsRoute(json);
  return r ? { ok: true, ...r } : { ok: false, reason: "NO_ROUTE" };
}

async function readCache(key: string, now: Date): Promise<RouteLeg | null> {
  const hit = await db.routeCache.findUnique({ where: { key } });
  if (!hit) return null;
  const age = now.getTime() - hit.createdAt.getTime();
  if (hit.ok && age < OK_TTL) return { ok: true, km: hit.distanceKm, minutes: hit.minutes, path: JSON.parse(hit.path) as Pt[], tollShare: hit.tollShare };
  if (!hit.ok && age < NO_ROUTE_TTL) return { ok: false, reason: "NO_ROUTE" };
  return null;
}

/** A road route for this truck profile, from the cache when possible. Null when routing is not set up. */
export async function routeLeg(from: LatLng, to: LatLng, profile: RouteProfile, now = new Date()): Promise<RouteLeg | null> {
  if (!routingEnabled()) return null;
  const key = legKey(from, to, profile);
  const cached = await readCache(key, now);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  if (throttled(now.getTime())) return { ok: false, reason: "BUSY" };
  if (!(await underDailyCap(now))) return { ok: false, reason: "LIMIT" };

  const job = (async () => {
    const leg = await fetchLeg(from, to, profile);
    // Only stable answers are remembered: a route, or "no road suits this truck". Outages and limits are retried later.
    if (leg.ok || leg.reason === "NO_ROUTE") {
      const data = leg.ok
        ? { ok: true, reason: null, distanceKm: leg.km, minutes: leg.minutes, tollShare: leg.tollShare, path: JSON.stringify(leg.path), createdAt: now }
        : { ok: false, reason: "NO_ROUTE", distanceKm: 0, minutes: 0, tollShare: null, path: "[]", createdAt: now };
      await db.routeCache.upsert({ where: { key }, create: { key, source: "ors", ...data }, update: data });
    } else if (leg.reason === "BAD_KEY") {
      console.error("[routing] the routing service rejected ORS_API_KEY");
    }
    return leg;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

export interface RoutedTruck extends TruckDims {
  adr?: boolean | null;
  currentCityId: string;
  lat?: number | null;
  lng?: number | null;
  positionAt?: Date | null;
}

export interface RoutedLoad {
  originCityId: string;
  destCityId: string;
  adrClass?: string | null;
  requirements?: string;
}

function requirementList(s: string | undefined): string[] {
  try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

/**
 * The two legs of a job for one truck: the empty drive to the pickup (null when the truck is already there)
 * and the loaded drive. `waitMs` caps how long to wait for the routing service: a page that needs the numbers
 * now falls back to the table distances when it is slow (the answer still lands in the cache for next time).
 * `cachedOnly` never calls the service.
 */
export async function legsFor(truck: RoutedTruck, load: RoutedLoad, opts: { waitMs?: number; cachedOnly?: boolean } = {}) {
  const o = getCity(load.originCityId);
  const d = getCity(load.destCityId);
  const hazmat = !!truck.adr && needsAdr({ adrClass: load.adrClass, requirements: requirementList(load.requirements) });
  const profile = profileOf(truck, hazmat);
  if (!routingEnabled() || !o || !d) return { profile, hazmat, loaded: null as RouteLeg | null, empty: null as RouteLeg | null };
  const here = freshGps(truck) ?? getCity(truck.currentCityId) ?? o;
  const emptyNeeded = Math.abs(here.lat - o.lat) + Math.abs(here.lng - o.lng) > 0.05;
  const run = async (from: LatLng, to: LatLng): Promise<RouteLeg | null> => {
    if (opts.cachedOnly) return readCache(legKey(from, to, profile), new Date());
    const job = routeLeg(from, to, profile);
    if (!opts.waitMs) return job;
    return Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), opts.waitMs))]);
  };
  const [loaded, empty] = await Promise.all([run(o, d), emptyNeeded ? run(here, o) : Promise.resolve(null)]);
  return { profile, hazmat, loaded, empty };
}
