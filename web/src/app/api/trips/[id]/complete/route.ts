import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { tellLoadOwners } from "@/server/services/load-owner";

/**
 * The load is delivered: the trip is COMPLETED, and the truck is available again in the destination city (the
 * old GPS fix is dropped — it describes where the truck was, not where it is). The shipper is told, and the
 * carrier can review the shipper from the truck page.
 */
export const POST = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const trip = await db.trip.findUnique({ where: { id: params.id }, include: { offer: true, truck: { select: { id: true, status: true } } } });
    if (!trip || trip.orgId !== session.orgId) throw new HttpError(404, "Trip not found.");
    if (trip.status === "COMPLETED" || trip.status === "CANCELLED") throw new HttpError(409, "This trip is already finished.");

    const now = new Date();
    await db.$transaction(async (tx) => {
      const done = await tx.trip.updateMany({ where: { id: trip.id, status: { in: ["PLANNED", "IN_TRANSIT"] } }, data: { status: "COMPLETED", completedAt: now } });
      if (done.count === 0) throw new HttpError(409, "This trip is already finished.");
      // Only free a truck that is on this trip's business; one the owner has since put in maintenance stays as it is.
      if (["LOADING", "IN_TRANSIT", "UNLOADING"].includes(trip.truck.status)) {
        await tx.truck.update({ where: { id: trip.truck.id }, data: { status: "AVAILABLE", currentCityId: trip.destCityId, availableFrom: now, lat: null, lng: null, positionAt: null } });
        await tx.truckLocation.create({ data: { truckId: trip.truck.id, cityId: trip.destCityId } });
      }
    });
    invalidateMarketCache();
    if (trip.offer) await tellLoadOwners(trip.offer, { kind: "delivered", carrier: session.org.name }).catch((e) => console.error("[trip.complete] could not notify the load owner", e));
    await audit({ userId: session.userId, orgId: session.orgId, action: "trip.complete", entity: "Trip", entityId: trip.id, ip });
    return { ok: true, truckId: trip.truck.id, destCityId: trip.destCityId };
  },
  { action: "trip:assign", limit: 30 },
);
