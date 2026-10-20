import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { hasDimensions } from "@/server/domain/route-profile";
import { legsFor, routingEnabled, type RouteLeg } from "@/server/services/routing";

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

    const { profile, hazmat, loaded, empty } = await legsFor(truck, offer);
    return { enabled: true, truckCode: truck.code, hasDimensions: hasDimensions(profile), hazmat, loaded: dto(loaded), empty: dto(empty) };
  },
  { limit: 60 },
);

function dto(l: RouteLeg | null) {
  if (!l) return null;
  return l.ok ? { ok: true as const, km: l.km, minutes: l.minutes, path: l.path, tollShare: l.tollShare } : { ok: false as const, reason: l.reason };
}
