import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { invalidateMarketCache } from "@/server/services/market";

/** Close a load this organization posted (e.g. it was covered). */
export const DELETE = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const own = await db.freightListing.findFirst({ where: { offerId: params.id, sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${session.orgId}-` } } });
    if (!own) throw new HttpError(404, "You can only close loads your company posted.");
    await db.freightOffer.update({ where: { id: params.id }, data: { status: "BOOKED" } });
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "load.close", entity: "FreightOffer", entityId: params.id, ip });
    return { ok: true };
  },
  { limit: 30 },
);
