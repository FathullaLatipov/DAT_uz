import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";

const schema = z.object({ status: z.enum(["ACTIVE", "EXPIRED"]) });

/** Platform admin hides a load from the board, or puts it back (only while its time has not passed). */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const { status } = schema.parse(await req.json());
    const offer = await db.freightOffer.findUnique({ where: { id: params.id }, select: { id: true, status: true, expiresAt: true } });
    if (!offer) throw new HttpError(404, "Load not found.");
    if (status === "ACTIVE" && offer.status === "BOOKED") throw new HttpError(409, "This load has been taken by a carrier.");
    if (status === "ACTIVE" && offer.expiresAt < new Date()) throw new HttpError(409, "This load's time has passed.");
    await db.freightOffer.update({ where: { id: offer.id }, data: { status } });
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: status === "EXPIRED" ? "load.hide" : "load.restore", entity: "FreightOffer", entityId: offer.id, ip });
    return { ok: true };
  },
  { action: "platform:admin", limit: 120 },
);
