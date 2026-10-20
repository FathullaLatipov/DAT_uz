import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { tellLoadOwners } from "@/server/services/load-owner";
import { getCity } from "@/server/domain/geo";
import { transitDaysWithBorders } from "@/server/domain/borders";

/** The truck leaves with the load: PLANNED → IN_TRANSIT. The shipper is told. */
export const POST = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const trip = await db.trip.findUnique({ where: { id: params.id }, include: { offer: true, truck: { select: { id: true, code: true, bodyType: true, capacityKg: true, status: true, crew: true } } } });
    if (!trip || trip.orgId !== session.orgId) throw new HttpError(404, "Trip not found.");
    if (trip.status !== "PLANNED") throw new HttpError(409, "Only a planned trip can be started.");

    await db.$transaction(async (tx) => {
      // The real departure: from here the trip is timed (progress, ETA) and tracked.
      const now = new Date();
      const done = await tx.trip.updateMany({
        where: { id: trip.id, status: "PLANNED" },
        data: { status: "IN_TRANSIT", startedAt: now, etaAt: new Date(now.getTime() + transitDaysWithBorders(trip.loadedKm, getCity(trip.originCityId)?.country ?? "", getCity(trip.destCityId)?.country ?? "", trip.truck.crew) * 86_400_000) },
      });
      if (done.count === 0) throw new HttpError(409, "Only a planned trip can be started.");
      await tx.truck.update({ where: { id: trip.truck.id }, data: { status: "IN_TRANSIT" } });
    });
    invalidateMarketCache();
    if (trip.offer) await tellLoadOwners(trip.offer, { kind: "started", carrier: session.org.name, truck: trip.truck }).catch((e) => console.error("[trip.start] could not notify the load owner", e));
    await audit({ userId: session.userId, orgId: session.orgId, action: "trip.start", entity: "Trip", entityId: trip.id, ip });
    return { ok: true };
  },
  { action: "trip:assign", limit: 30 },
);
