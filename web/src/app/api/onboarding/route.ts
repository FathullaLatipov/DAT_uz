import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { invalidateMarketCache } from "@/server/services/market";
import { ACCOUNT_TYPES, BODY_TYPES, CARGO_TYPES, PAYMENT_TERMS, ROLE_FOR, TRUCK_TYPES } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";
import { startSession } from "@/server/auth/session";

const city = z.string().refine((id) => !!getCity(id), "Unknown city");

const schema = z.object({
  accountType: z.enum(ACCOUNT_TYPES),
  truck: z.object({
    truckType: z.enum(TRUCK_TYPES),
    bodyType: z.enum(BODY_TYPES),
    capacityKg: z.number().int().min(500).max(60000),
    volumeM3: z.number().min(1).max(200),
    currentCityId: city,
    availableFrom: z.string(),
  }).optional(),
  routes: z.array(z.object({ originCityId: city, destCityId: city })).max(10),
  prefs: z.object({
    minRatePerKmUsd: z.number().min(0).max(10).nullable(),
    maxDeadheadKm: z.number().int().min(0).max(2000),
    preferredCargo: z.array(z.enum(CARGO_TYPES)),
    preferredCountries: z.array(z.string().length(2)),
    paymentTerms: z.array(z.enum(PAYMENT_TERMS)),
  }),
});

export const POST = api(async ({ req, session, ip }) => {
  const body = schema.parse(await req.json());
  const orgId = session.orgId;
  // Onboarding may only re-assign roles in an org this user owns (single-member org).
  const members = await db.membership.count({ where: { orgId } });
  if (members > 1 && session.role !== "COMPANY_ADMIN") throw new HttpError(403, "Ask your company admin to change organization settings.");

  const role = ROLE_FOR[body.accountType];
  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { userId_orgId: { userId: session.userId, orgId } }, data: { accountType: body.accountType, role: members > 1 ? session.role : role } });
    if (body.truck) {
      const count = await tx.truck.count({ where: { orgId } });
      const t = body.truck;
      await tx.truck.create({
        data: {
          orgId, code: `T-${1001 + count}`, truckType: t.truckType, bodyType: t.bodyType, capacityKg: t.capacityKg, volumeM3: t.volumeM3,
          currentCityId: t.currentCityId, availableFrom: new Date(t.availableFrom), status: "AVAILABLE",
        },
      });
    }
    await tx.preferredRoute.deleteMany({ where: { orgId } });
    if (body.routes.length) await tx.preferredRoute.createMany({ data: body.routes.map((r) => ({ ...r, orgId })) });
    const p = body.prefs;
    const prefData = {
      minRatePerKmUsd: p.minRatePerKmUsd, maxDeadheadKm: p.maxDeadheadKm,
      preferredCargo: JSON.stringify(p.preferredCargo), preferredCountries: JSON.stringify(p.preferredCountries), paymentTerms: JSON.stringify(p.paymentTerms),
    };
    await tx.orgPreference.upsert({ where: { orgId }, create: { orgId, ...prefData }, update: prefData });
  });
  if (members <= 1) await startSession({ uid: session.userId, oid: orgId, role, prole: session.platformRole });
  invalidateMarketCache();
  await audit({ userId: session.userId, orgId, action: "onboarding.complete", meta: { accountType: body.accountType }, ip });
  return { ok: true };
});
