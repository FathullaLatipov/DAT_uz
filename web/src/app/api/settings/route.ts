import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";
import { audit } from "@/server/security";
import { CARGO_TYPES, PAYMENT_TERMS } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";

const city = z.string().refine((id) => !!getCity(id), "Unknown city");
const schema = z.object({
  minRatePerKmUsd: z.number().min(0).max(10).nullable(),
  maxDeadheadKm: z.number().int().min(0).max(2000),
  preferredCargo: z.array(z.enum(CARGO_TYPES)),
  preferredCountries: z.array(z.string().length(2)).max(20),
  paymentTerms: z.array(z.enum(PAYMENT_TERMS)),
  routes: z.array(z.object({ originCityId: city, destCityId: city })).max(20),
});

export const PATCH = api(
  async ({ req, session, ip }) => {
    const b = schema.parse(await req.json());
    const data = {
      minRatePerKmUsd: b.minRatePerKmUsd, maxDeadheadKm: b.maxDeadheadKm, preferredCargo: JSON.stringify(b.preferredCargo),
      preferredCountries: JSON.stringify(b.preferredCountries), paymentTerms: JSON.stringify(b.paymentTerms),
    };
    await db.$transaction([
      db.orgPreference.upsert({ where: { orgId: session.orgId }, create: { orgId: session.orgId, ...data }, update: data }),
      // Country-level routes (e.g. Fergana → any city in RU) aren't edited by this form — keep them.
      db.preferredRoute.deleteMany({ where: { orgId: session.orgId, destCityId: { not: null } } }),
      db.preferredRoute.createMany({ data: b.routes.map((r) => ({ ...r, orgId: session.orgId })) }),
    ]);
    await audit({ userId: session.userId, orgId: session.orgId, action: "settings.preferences", ip });
    return { ok: true };
  },
  { action: "settings:write" },
);
