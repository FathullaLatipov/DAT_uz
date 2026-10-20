import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";
import { ingestPlatformListing } from "@/server/ingestion/pipeline";
import { invalidateMarketCache } from "@/server/services/market";
import { getI18n } from "@/i18n/server";

const city = z.string().refine((id) => !!getCity(id), "Unknown city");
const schema = z
  .object({
    originCityId: city,
    destCityId: city,
    loadingDate: z.string().min(8),
    unloadingDate: z.string().optional().nullable(),
    cargoType: z.enum(CARGO_TYPES),
    weightKg: z.number().int().min(100).max(44000),
    volumeM3: z.number().min(0).max(200).optional().nullable(),
    bodyType: z.enum(BODY_TYPES),
    rate: z.number().min(0).max(1e10).optional().nullable(),
    currency: z.enum(CURRENCIES),
    paymentTerms: z.enum(PAYMENT_TERMS).optional().nullable(),
    contactName: z.string().trim().min(2).max(80),
    contactPhone: z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number"),
    contactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email address").max(120)]).optional(),
    requirements: z.string().trim().max(300).optional(),
    cargoLengthM: z.number().min(0.1).max(30).optional().nullable(),
    cargoWidthM: z.number().min(0.1).max(10).optional().nullable(),
    cargoHeightM: z.number().min(0.1).max(10).optional().nullable(),
    oversize: z.boolean().optional(),
    adrClass: z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]).optional().nullable(),
  })
  .refine((v) => v.originCityId !== v.destCityId, { message: "Origin and destination must differ", path: ["destCityId"] });

export const POST = api(
  async ({ req, session, ip }) => {
    const b = schema.parse(await req.json());
    const loading = new Date(b.loadingDate);
    if (Number.isNaN(loading.getTime()) || loading.getTime() < Date.now() - 86_400_000) throw new HttpError(400, "Loading date must be today or later.");
    const externalId = `${session.orgId}-${Date.now().toString(36)}`;
    const res = await ingestPlatformListing(db, {
      externalId,
      origin: b.originCityId,
      destination: b.destCityId,
      loadingDate: loading,
      unloadingDate: b.unloadingDate || null,
      cargo: b.cargoType.toLowerCase(),
      weight: b.weightKg,
      weightUnit: "kg",
      volume: b.volumeM3 ?? undefined,
      bodyType: b.bodyType.toLowerCase(),
      rate: b.rate || null,
      currency: b.currency,
      paymentTerms: b.paymentTerms?.toLowerCase(),
      broker: session.org.name,
      contactName: b.contactName,
      contactPhone: b.contactPhone,
      contactEmail: b.contactEmail || undefined,
      cargoLengthM: b.cargoLengthM, cargoWidthM: b.cargoWidthM, cargoHeightM: b.cargoHeightM, oversize: b.oversize, adrClass: b.adrClass,
      requirements: b.requirements ? b.requirements.split(",").map((s) => s.trim()).filter(Boolean) : [],
      postedAt: new Date(),
      expiresAt: new Date(loading.getTime() + 86_400_000),
      raw: { ...b, postedBy: session.userId, orgId: session.orgId },
    });
    if (!res.ok) {
      const { m } = await getI18n();
      throw new HttpError(400, res.issues.map((i) => m.issues[i.code] ?? i.message).join("; "));
    }
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "load.post", entity: "FreightOffer", entityId: res.offerId, ip });
    return { ok: true, id: res.offerId, merged: res.outcome === "duplicates", warnings: res.issues.filter((i) => i.severity === "WARN").map((i) => i.message) };
  },
  { limit: 10 },
);
