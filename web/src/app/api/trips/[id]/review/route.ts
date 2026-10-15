import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  paidOnTime: z.boolean().optional().nullable(),
  disputed: z.boolean().optional(),
  cancelled: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
});

/** Leave a review for the broker on a completed trip. One review per trip, authored by the
 * carrier org that ran it — never the broker's own org (there's nothing stopping a broker from
 * calling this for someone else's trip id, but the org-ownership check below blocks that). */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const b = schema.parse(await req.json());
    const trip = await db.trip.findUnique({
      where: { id: params.id },
      include: { offer: { select: { brokerId: true } }, review: true },
    });
    if (!trip || trip.orgId !== session.orgId) throw new HttpError(404, "Trip not found.");
    if (trip.status !== "COMPLETED") throw new HttpError(400, "Only completed trips can be reviewed.");
    if (!trip.offer?.brokerId) throw new HttpError(400, "No broker was identified for this trip, so there's nothing to review.");
    if (trip.review) throw new HttpError(409, "A review has already been submitted for this trip.");

    const review = await db.brokerReview.create({
      data: {
        brokerId: trip.offer.brokerId,
        orgId: session.orgId,
        tripId: trip.id,
        rating: b.rating,
        paidOnTime: b.paidOnTime ?? null,
        disputed: b.disputed ?? false,
        cancelled: b.cancelled ?? false,
        comment: b.comment || null,
      },
    });
    await audit({ userId: session.userId, orgId: session.orgId, action: "broker.review", entity: "BrokerReview", entityId: review.id, ip });
    return { ok: true, id: review.id };
  },
  { limit: 20 },
);
