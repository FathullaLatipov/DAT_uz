import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).max(300).nullish(),
});

const MIN_GAP_MS = 10_000;
const MAX_POINTS = 3000;

/**
 * The truck's phone reports where it is while the trip is on the road. Stored as the trip's track and also as the
 * truck's current position. Reports closer than 10 s apart are ignored, and a trip keeps at most 3,000 points.
 */
export const POST = api<{ id: string }>(
  async ({ req, session, params }) => {
    const b = schema.parse(await req.json());
    const trip = await db.trip.findUnique({ where: { id: params.id }, select: { id: true, orgId: true, truckId: true, status: true } });
    if (!trip || trip.orgId !== session.orgId) throw new HttpError(404, "Trip not found.");
    if (trip.status !== "IN_TRANSIT") throw new HttpError(409, "Positions are only accepted while the trip is on the road.");
    const now = new Date();
    const [last, count] = await Promise.all([
      db.tripPoint.findFirst({ where: { tripId: trip.id }, orderBy: { at: "desc" }, select: { at: true } }),
      db.tripPoint.count({ where: { tripId: trip.id } }),
    ]);
    if ((last && now.getTime() - last.at.getTime() < MIN_GAP_MS) || count >= MAX_POINTS) return { ok: true, stored: false };
    await db.$transaction([
      db.tripPoint.create({ data: { tripId: trip.id, lat: b.lat, lng: b.lng, speed: b.speed ?? null, at: now } }),
      db.truck.update({ where: { id: trip.truckId }, data: { lat: b.lat, lng: b.lng, positionAt: now } }),
    ]);
    return { ok: true, stored: true };
  },
  { limit: 120 },
);
