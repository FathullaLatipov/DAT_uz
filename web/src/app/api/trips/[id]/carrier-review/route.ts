import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { notifyOrg } from "@/server/services/notify-user";
import { postingOrgIds } from "@/server/services/load-owner";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  onTime: z.boolean().optional().nullable(),
  comment: z.string().trim().max(500).optional(),
});

/**
 * A shipper reviews the carrier that delivered their load. One review per trip, written by a company that posted the
 * load (the carrier's own review of the shipper is `/review`). The carrier is told.
 */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const b = schema.parse(await req.json());
    const trip = await db.trip.findUnique({
      where: { id: params.id },
      include: { offer: { select: { id: true, originCityId: true, destCityId: true, loadingDate: true } }, carrierReview: { select: { id: true } } },
    });
    if (!trip?.offer) throw new HttpError(404, "Trip not found.");
    // Only a company that posted this load may review its carrier.
    if (!(await postingOrgIds(trip.offer.id)).includes(session.orgId)) throw new HttpError(404, "Trip not found.");
    if (trip.status !== "COMPLETED") throw new HttpError(400, "Only completed trips can be reviewed.");
    if (trip.carrierReview) throw new HttpError(409, "A review has already been submitted for this trip.");

    const review = await db.carrierReview.create({
      data: { tripId: trip.id, carrierOrgId: trip.orgId, shipperOrgId: session.orgId, rating: b.rating, onTime: b.onTime ?? null, comment: b.comment || null },
    });
    await audit({ userId: session.userId, orgId: session.orgId, action: "carrier.review", entity: "CarrierReview", entityId: review.id, ip });
    const offer = trip.offer;
    await notifyOrg(trip.orgId, (i) => ({
      title: i.t("notify.carrierReviewedTitle", { shipper: session.org.name, rating: b.rating }),
      body: i.t("notify.carrierReviewedBody", { route: `${i.city(offer.originCityId)} → ${i.city(offer.destCityId)}`, date: i.shortDate(offer.loadingDate), comment: b.comment ? ` — “${b.comment.slice(0, 140)}”` : "" }),
      link: "/app/reviews",
      button: i.t("notify.carrierReviewedOpen"),
    })).catch((e) => console.error("[carrier-review] notify failed", e));
    return { ok: true, id: review.id };
  },
  { limit: 20 },
);
