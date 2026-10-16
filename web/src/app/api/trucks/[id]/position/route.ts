import { z } from "zod";
import { db } from "@/server/db";
import { nearestCityTo } from "@/server/domain/geo";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";

const body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Past this distance the fix is stored but doesn't move the truck's planning city. */
const CITY_SNAP_KM = 300;

async function ownTruck(id: string, orgId: string) {
  const t = await db.truck.findFirst({ where: { id, orgId } });
  if (!t) throw new HttpError(404, "Truck not found.");
  return t;
}

/** Phone GPS fix for a truck: sharpens deadhead distances and snaps the truck to the nearest city. */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const t = await ownTruck(params.id, session.orgId);
    const { lat, lng } = body.parse(await req.json());
    const near = nearestCityTo(lat, lng);
    // A truck that is mid-trip keeps its trip-based city; the fix is still recorded.
    const moves = ["AVAILABLE", "OFFLINE"].includes(t.status) && near.distanceKm <= CITY_SNAP_KM && near.city.id !== t.currentCityId;
    await db.truck.update({
      where: { id: t.id },
      data: { lat, lng, positionAt: new Date(), ...(moves ? { currentCityId: near.city.id } : {}) },
    });
    if (moves) await db.truckLocation.create({ data: { truckId: t.id, cityId: near.city.id } });
    await audit({ userId: session.userId, orgId: session.orgId, action: "truck.position", entity: "Truck", entityId: t.id, meta: { city: near.city.id, snapped: moves }, ip });
    return { ok: true, cityId: near.city.id, distanceKm: Math.round(near.distanceKm), snapped: moves };
  },
  { action: "truck:write", limit: 120 },
);

/** Forget the fix; planning falls back to the city. */
export const DELETE = api<{ id: string }>(
  async ({ session, params }) => {
    const t = await ownTruck(params.id, session.orgId);
    await db.truck.update({ where: { id: t.id }, data: { lat: null, lng: null, positionAt: null } });
    return { ok: true };
  },
  { action: "truck:write", limit: 60 },
);
