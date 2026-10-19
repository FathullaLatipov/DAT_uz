import { db } from "../db";
import { PLATFORM_SOURCE } from "../ingestion/pipeline";
import { notifyUser, RECIPIENT_SELECT } from "./notify-user";

type Offer = { id: string; originCityId: string; destCityId: string; loadingDate: Date };

/**
 * Tells every company that posted this load on Karvon (the same load posted twice is merged into one offer)
 * what happened to it, in each person's own language and in Telegram when they linked it. Loads that came
 * from other sources have no owner here, so nobody is told.
 */
export async function tellLoadOwners(
  offer: Offer,
  event:
    | { kind: "taken"; carrier: string; contact: string; truck: { code: string; bodyType: string; capacityKg: number } }
    | { kind: "cancelled"; carrier: string }
    | { kind: "started"; carrier: string; truck: { code: string; bodyType: string; capacityKg: number } }
    | { kind: "delivered"; carrier: string },
) {
  const posted = await db.freightListing.findMany({ where: { offerId: offer.id, sourceId: PLATFORM_SOURCE.id }, select: { externalId: true } });
  const orgIds = [...new Set(posted.map((l) => l.externalId.slice(0, l.externalId.indexOf("-"))).filter((id) => id.length > 0))];
  if (!orgIds.length) return;
  const members = await db.membership.findMany({ where: { orgId: { in: orgIds } }, select: { user: { select: RECIPIENT_SELECT } } });
  for (const { user } of members) {
    await notifyUser(user, (i) => {
      const route = `${i.city(offer.originCityId)} → ${i.city(offer.destCityId)}`;
      const date = i.shortDate(offer.loadingDate);
      const truckText = "truck" in event ? `${event.truck.code}, ${i.tonnes(event.truck.capacityKg)} ${i.label(event.truck.bodyType).toLowerCase()}` : "";
      const body =
        event.kind === "taken"
          ? i.t("notify.takenBody", { route, date, truck: truckText, contact: event.contact })
          : event.kind === "started"
            ? i.t("notify.startedBody", { route, date, truck: truckText })
            : i.t(event.kind === "delivered" ? "notify.deliveredBody" : "notify.cancelledBody", { route, date });
      // The shipper's own page for this load: who took it, which truck, where the trip is.
      return { title: i.t(`notify.${event.kind}Title`, { carrier: event.carrier }), body, link: `/app/my-loads#load-${offer.id}`, button: i.t("notify.takenOpen") };
    });
  }
}
