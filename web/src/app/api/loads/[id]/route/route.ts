import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { freshGps, getCity } from "@/server/domain/geo";
import { needsAdr } from "@/server/domain/fit";
import { hasDimensions, profileOf } from "@/server/domain/route-profile";
import { routeLeg, routingEnabled, type RouteLeg } from "@/server/services/routing";

/** The road route of one load for one of the caller's trucks: the loaded leg and the empty drive to the pickup. */
export const GET = api<{ id: string }>(
  async ({ req, session, params }) => {
    if (!routingEnabled()) return { enabled: false };
    const truckId = req.nextUrl.searchParams.get("truck") ?? "";
    const [offer, truck] = await Promise.all([
      db.freightOffer.findUnique({ where: { id: params.id } }),
      db.truck.findFirst({ where: { id: truckId, orgId: session.orgId } }), // org isolation
    ]);
    if (!offer) throw new HttpError(404, "Load not found.");
    if (!truck) throw new HttpError(404, "Truck not found in your fleet.");

    const o = getCity(offer.originCityId);
    const d = getCity(offer.destCityId);
    if (!o || !d) return { enabled: true, loaded: null, empty: null };
    const hazmat = truck.adr && needsAdr({ adrClass: offer.adrClass, requirements: safeList(offer.requirements) });
    const profile = profileOf(truck, hazmat);
    const here = freshGps(truck) ?? (getCity(truck.currentCityId) ?? o);
    const emptyNeeded = Math.abs(here.lat - o.lat) + Math.abs(here.lng - o.lng) > 0.05;

    const [loaded, empty] = await Promise.all([
      routeLeg(o, d, profile),
      emptyNeeded ? routeLeg(here, o, profile) : Promise.resolve(null),
    ]);
    return { enabled: true, truckCode: truck.code, hasDimensions: hasDimensions(profile), hazmat, loaded: dto(loaded), empty: dto(empty) };
  },
  { limit: 60 },
);

function dto(l: RouteLeg | null) {
  if (!l) return null;
  return l.ok ? { ok: true as const, km: l.km, minutes: l.minutes, path: l.path, tollShare: l.tollShare } : { ok: false as const, reason: l.reason };
}

function safeList(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
