import { z } from "zod";
import { BODY_TYPES, TRUCK_STATUSES, TRUCK_TYPES } from "@/server/domain/enums";
import { getCity } from "@/server/domain/geo";

const metres = (max: number) => z.number().min(0.5).max(max).nullable().optional();

export const truckBase = z.object({
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
  // Passport: null/absent = unknown.
  cargoLengthM: metres(30),
  cargoWidthM: metres(4),
  cargoHeightM: metres(5),
  heightM: metres(5),
  widthM: metres(4),
  lengthM: metres(35),
  grossWeightKg: z.number().int().min(1000).max(80000).nullable().optional(),
  axles: z.number().int().min(2).max(12).nullable().optional(),
  axleLoadKg: z.number().int().min(1000).max(20000).nullable().optional(),
  adr: z.boolean().optional(),
  crew: z.number().int().min(1).max(2).optional(),
});

export const truckSchema = truckBase.refine((v) => !(v.cargoHeightM && v.heightM && v.cargoHeightM > v.heightM), { message: "Cargo space cannot be taller than the whole vehicle.", path: ["cargoHeightM"] })
  .refine((v) => !(v.cargoLengthM && v.lengthM && v.cargoLengthM > v.lengthM), { message: "Cargo space cannot be longer than the whole vehicle.", path: ["cargoLengthM"] });
