import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";

const schema = z.object({ offerId: z.string().min(1).max(64) });

export const POST = api(async ({ req, session }) => {
  const { offerId } = schema.parse(await req.json());
  if (!(await db.freightOffer.findUnique({ where: { id: offerId }, select: { id: true } }))) throw new HttpError(404, "This load no longer exists.");
  await db.favorite.upsert({
    where: { userId_offerId: { userId: session.userId, offerId } },
    create: { userId: session.userId, orgId: session.orgId, offerId },
    update: {},
  });
  return { ok: true };
});

export const DELETE = api(async ({ req, session }) => {
  const { offerId } = schema.parse(await req.json());
  await db.favorite.deleteMany({ where: { userId: session.userId, offerId } });
  return { ok: true };
});
