import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { tellLoadOwners } from "@/server/services/load-owner";

/**
 * The carrier gives a taken load back. Only a trip that has not started (PLANNED) can be cancelled: the load
 * returns to the board (unless its time has passed), the truck is free again, and the shipper is told.
 */
export const POST = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const trip = await db.trip.findUnique({ where: { id: params.id }, include: { offer: true, truck: { select: { id: true, status: true } } } });
    if (!trip || trip.orgId !== session.orgId) throw new HttpError(404, "Trip not found.");
    if (trip.status !== "PLANNED") throw new HttpError(409, "Only a trip that hasn't started can be cancelled.");

    const now = new Date();
    await db.$transaction(async (tx) => {
      // Conditional update, so a double click (or two tabs) cancels once.
      const done = await tx.trip.updateMany({ where: { id: trip.id, status: "PLANNED" }, data: { status: "CANCELLED", completedAt: now } });
      if (done.count === 0) throw new HttpError(409, "Only a trip that hasn't started can be cancelled.");
      if (trip.truck.status === "LOADING") await tx.truck.update({ where: { id: trip.truck.id }, data: { status: "AVAILABLE", availableFrom: now } });
      if (trip.offer?.status === "BOOKED") await tx.freightOffer.update({ where: { id: trip.offer.id }, data: { status: trip.offer.expiresAt > now ? "ACTIVE" : "EXPIRED" } });
    });
    invalidateMarketCache();
    if (trip.offer) await tellLoadOwners(trip.offer, { kind: "cancelled", carrier: session.org.name }).catch((e) => console.error("[cancel] could not notify the load owner", e));
    await audit({ userId: session.userId, orgId: session.orgId, action: "trip.cancel", entity: "Trip", entityId: trip.id, meta: { offerId: trip.offerId }, ip });
    return { ok: true, offerBackOnBoard: !!trip.offer && trip.offer.expiresAt > now };
  },
  { action: "trip:assign", limit: 20 },
);
