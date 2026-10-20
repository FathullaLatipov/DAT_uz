import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { truckBase } from "../schema";

async function ownTruck(id: string, orgId: string) {
  const t = await db.truck.findFirst({ where: { id, orgId }, include: { driver: true } });
  if (!t) throw new HttpError(404, "Truck not found.");
  return t;
}

export const PATCH = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const t = await ownTruck(params.id, session.orgId);
    const { driverName, availableFrom, ...data } = truckBase.partial().parse(await req.json());
    let driverId = t.driverId;
    if (driverName !== undefined) {
      if (!driverName) driverId = null;
      else if (t.driver) await db.driver.update({ where: { id: t.driver.id }, data: { name: driverName } });
      else driverId = (await db.driver.create({ data: { orgId: session.orgId, name: driverName } })).id;
    }
    await db.truck.update({ where: { id: t.id }, data: { ...data, ...(data.currentCityId && data.currentCityId !== t.currentCityId ? { lat: null, lng: null, positionAt: null } : {}), driverId, ...(availableFrom ? { availableFrom: new Date(availableFrom) } : {}) } });
    if (data.currentCityId && data.currentCityId !== t.currentCityId) await db.truckLocation.create({ data: { truckId: t.id, cityId: data.currentCityId } });
    // Freeing a truck closes its open trip.
    if (data.status === "AVAILABLE" && t.status !== "AVAILABLE") {
      await db.trip.updateMany({ where: { truckId: t.id, status: { in: ["PLANNED", "IN_TRANSIT"] } }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "truck.update", entity: "Truck", entityId: t.id, meta: Object.keys(data), ip });
    return { ok: true };
  },
  { action: "truck:write", limit: 60 },
);

export const DELETE = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const t = await ownTruck(params.id, session.orgId);
    await db.truck.delete({ where: { id: t.id } });
    await audit({ userId: session.userId, orgId: session.orgId, action: "truck.delete", entity: "Truck", entityId: t.id, meta: { code: t.code }, ip });
    return { ok: true };
  },
  { action: "truck:delete", limit: 20 },
);
