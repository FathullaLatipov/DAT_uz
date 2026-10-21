import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";
import { audit } from "@/server/security";
import { COUNTRIES } from "@/server/domain/geo";
import { invalidateFuelTable } from "@/server/services/fuel";
import { invalidateMarketCache } from "@/server/services/market";

const schema = z.object({
  country: z.string().refine((c) => COUNTRIES.some((x) => x.code === c), "Unknown country"),
  priceUsd: z.number().min(0.05).max(5),
});

/** Platform admin: set the diesel price (USD per litre) of one country. */
export const PATCH = api(
  async ({ req, session, ip }) => {
    const { country, priceUsd } = schema.parse(await req.json());
    const row = await db.fuelPrice.upsert({
      where: { country },
      create: { country, priceUsd, updatedBy: session.userId },
      update: { priceUsd, updatedBy: session.userId },
    });
    invalidateFuelTable();
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "fuel.update", entity: "FuelPrice", entityId: country, meta: { priceUsd }, ip });
    return { ok: true, country, priceUsd: row.priceUsd, updatedAt: row.updatedAt };
  },
  { action: "platform:admin", limit: 60 },
);
