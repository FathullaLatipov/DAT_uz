import { z } from "zod";
import { BODY_TYPES, TRUCK_STATUSES, TRUCK_TYPES } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";

export const truckSchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  plate: z.string().trim().max(20).optional().nullable(),
  truckType: z.enum(TRUCK_TYPES),
  bodyType: z.enum(BODY_TYPES),
  capacityKg: z.number().int().min(500).max(60000),
  volumeM3: z.number().min(1).max(200),
  currentCityId: z.string().refine((id) => !!getCity(id), "Unknown city"),
  status: z.enum(TRUCK_STATUSES),
  availableFrom: z.string().min(8),
  driverName: z.string().trim().max(80).optional().nullable(),
  fuelLPer100km: z.number().min(5).max(80),
  fuelPriceUsd: z.number().min(0.1).max(5),
  driverCostPerKm: z.number().min(0).max(5),
  maintenancePerKm: z.number().min(0).max(5),
  otherPerTripUsd: z.number().min(0).max(10000),
});
