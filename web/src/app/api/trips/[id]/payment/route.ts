import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { applyPayment } from "@/server/services/payments";

const schema = z.object({ action: z.enum(["paid", "received", "dispute"]), note: z.string().trim().max(300).optional() });

/**
 * One step of the payment for a trip: the shipper says it was sent ("paid"), the carrier confirms it arrived
 * ("received") or reports that it did not ("dispute"). Anyone else gets 404.
 */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const b = schema.parse(await req.json());
    const trip = await db.trip.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true, offerId: true, status: true, paymentStatus: true, revenueUsd: true, originCityId: true, destCityId: true, startedAt: true, completedAt: true },
    });
    if (!trip) throw new HttpError(404, "Trip not found.");
    const r = await applyPayment(trip, session.orgId, b.action, b.note);
    if ("error" in r) {
      if (r.error === "not-found") throw new HttpError(404, "Trip not found.");
      if (r.error === "forbidden") throw new HttpError(403, "You can't do that with this payment.");
      if (r.error === "cancelled") throw new HttpError(409, "This trip was cancelled.");
      if (r.error === "not-delivered") throw new HttpError(409, "Only a delivered trip can be disputed.");
      throw new HttpError(409, "This payment has already moved on.");
    }
    await audit({ userId: session.userId, orgId: session.orgId, action: `payment.${b.action}`, entity: "Trip", entityId: trip.id, ip });
    return { ok: true };
  },
  { limit: 30 },
);
