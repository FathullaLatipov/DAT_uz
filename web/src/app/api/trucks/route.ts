import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { PLAN_FEATURES } from "@/server/auth/permissions";
import { truckSchema } from "./schema";

export const POST = api(
  async ({ req, session, ip }) => {
    const { driverName, availableFrom, ...data } = truckSchema.parse(await req.json());
    const count = await db.truck.count({ where: { orgId: session.orgId } });
    const max = PLAN_FEATURES[session.org.plan]?.maxTrucks ?? 1;
    // Plan limits are prepared but not enforced while billing isn't live — log instead.
    if (count >= max) console.info(`[plan] org ${session.orgId} exceeds ${session.org.plan} truck limit (${max})`);
    if (await db.truck.findFirst({ where: { orgId: session.orgId, code: data.code } })) throw new HttpError(409, `You already have a truck named ${data.code}.`);
    const driver = driverName ? await db.driver.create({ data: { orgId: session.orgId, name: driverName } }) : null;
    const t = await db.truck.create({ data: { ...data, orgId: session.orgId, availableFrom: new Date(availableFrom), driverId: driver?.id } });
    await db.truckLocation.create({ data: { truckId: t.id, cityId: t.currentCityId } });
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "truck.create", entity: "Truck", entityId: t.id, ip });
    return { ok: true, id: t.id };
  },
  { action: "truck:write", limit: 30 },
);
