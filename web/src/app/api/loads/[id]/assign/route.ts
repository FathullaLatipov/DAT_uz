import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { estimateTransitDays } from "@/server/domain/geo";
import { getI18n } from "@/i18n/server";
import { getMatchContext, getMatchTrucks, toMatchOffer } from "@/server/services/freight";
import { scoreMatch } from "@/server/services/matching";
import { findBackhaul } from "@/server/services/backhaul";
import { invalidateMarketCache } from "@/server/services/market";

const schema = z.object({ truckId: z.string().min(1).max(64) });
const DAY = 86_400_000;

export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const { truckId } = schema.parse(await req.json());
    const offer = await db.freightOffer.findUnique({ where: { id: params.id } });
    if (!offer || offer.status !== "ACTIVE") throw new HttpError(404, "This load is no longer available.");
    const trucks = await getMatchTrucks(session.orgId);
    const truck = trucks.find((t) => t.id === truckId); // org isolation: only this org's trucks
    if (!truck) throw new HttpError(404, "Truck not found in your fleet.");
    if (truck.status !== "AVAILABLE") throw new HttpError(409, `${truck.code} is not available right now.`);

    const match = scoreMatch(truck, toMatchOffer(offer), await getMatchContext(session.orgId));
    if (!match.eligible) throw new HttpError(409, `${truck.code} can't take this load: ${match.blockers[0]}`);

    const start = Math.max(offer.loadingDate.getTime(), match.readyAt.getTime());
    const eta = new Date(start + estimateTransitDays(offer.distanceKm) * DAY);

    const trip = await db.$transaction(async (tx) => {
      const t = await tx.trip.create({
        data: {
          orgId: session.orgId, truckId, offerId: offer.id, originCityId: offer.originCityId, destCityId: offer.destCityId, status: "PLANNED",
          startedAt: new Date(start), etaAt: eta, revenueUsd: offer.rateUsd, costUsd: match.profit.totalCost, loadedKm: offer.distanceKm, emptyKm: match.deadheadKm,
        },
      });
      await tx.truck.update({ where: { id: truckId }, data: { status: "LOADING", availableFrom: eta } });
      await tx.recommendation.create({ data: { orgId: session.orgId, truckId, offerId: offer.id, score: match.score, action: "ACCEPTED" } });
      return t;
    });
    invalidateMarketCache();

    // Kick off the backhaul search immediately and tell the user what we found.
    const plan = await findBackhaul(session.orgId, { ...truck, status: "AVAILABLE" }, offer.destCityId, eta, 120, 1);
    const best = plan.options[0];
    const { t, tn, city, usd } = await getI18n();
    await db.notification.create({
      data: {
        userId: session.userId,
        type: "BACKHAUL",
        title: tn("notify.arrives", Math.max(1, Math.round((eta.getTime() - Date.now()) / DAY)), { code: truck.code, city: city(offer.destCityId) }),
        body: best
          ? tn("notify.found", plan.totalFound, { route: `${city(best.offer.originCityId)} → ${city(best.offer.destCityId)}`, rate: usd(best.offer.rateUsd), score: best.match.score, profit: usd(best.match.profit.profit) })
          : t("notify.none"),
        link: best ? `/app/loads/${best.offer.id}?truck=${truck.id}` : `/app/fleet/${truck.id}`,
      },
    });
    await audit({ userId: session.userId, orgId: session.orgId, action: "trip.assign", entity: "Trip", entityId: trip.id, meta: { offerId: offer.id, truckId }, ip });
    return { ok: true, tripId: trip.id, redirect: `/app/fleet/${truck.id}?assigned=1` };
  },
  { action: "trip:assign", limit: 20 },
);
