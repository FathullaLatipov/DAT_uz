import { z } from "zod";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS } from "../domain/enums";

/** Load-board filters. Shared by the board, saved searches, NL search and the AI dispatcher. */
export const loadFiltersSchema = z.object({
  origin: z.string().optional(),
  originCountry: z.string().length(2).optional(),
  radiusKm: z.coerce.number().int().min(0).max(1000).optional(),
  dest: z.string().optional(),
  destCountry: z.string().length(2).optional(),
  loadingFrom: z.string().optional(), // YYYY-MM-DD
  loadingTo: z.string().optional(),
  unloadingTo: z.string().optional(),
  cargo: z.array(z.enum(CARGO_TYPES)).optional(),
  body: z.array(z.enum(BODY_TYPES)).optional(),
  weightMin: z.coerce.number().min(0).optional(),
  weightMax: z.coerce.number().min(0).optional(),
  volumeMin: z.coerce.number().min(0).optional(),
  rateMin: z.coerce.number().min(0).optional(),
  ratePerKmMin: z.coerce.number().min(0).optional(),
  currency: z.enum(CURRENCIES).optional(),
  payment: z.array(z.enum(PAYMENT_TERMS)).optional(),
  brokerId: z.string().optional(),
  source: z.string().optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxDeadhead: z.coerce.number().min(0).optional(),
  distanceMin: z.coerce.number().min(0).optional(),
  distanceMax: z.coerce.number().min(0).optional(),
  truckId: z.string().optional(),
  sort: z.enum(["score", "rate", "ratePerKm", "profit", "loading", "newest", "distance", "deadhead"]).optional(),
  q: z.string().max(300).optional(),
});
export type LoadFilters = z.infer<typeof loadFiltersSchema>;

const ARRAY_KEYS = ["cargo", "body", "payment"] as const;

/** URLSearchParams ⇄ LoadFilters. Arrays are comma-separated. Invalid values are dropped. */
export function filtersFromParams(sp: Record<string, string | string[] | undefined>): LoadFilters {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val == null || val === "") continue;
    obj[k] = (ARRAY_KEYS as readonly string[]).includes(k) ? val.split(",").filter(Boolean) : val;
  }
  if (obj.verifiedOnly) obj.verifiedOnly = obj.verifiedOnly === "1" || obj.verifiedOnly === "true";
  const parsed = loadFiltersSchema.safeParse(obj);
  if (parsed.success) return parsed.data;
  // Drop the offending keys instead of failing the whole page.
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  return loadFiltersSchema.parse(Object.fromEntries(Object.entries(obj).filter(([k]) => !bad.has(k))));
}

export function filtersToParams(f: LoadFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length) || v === false) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v === true ? 1 : v));
  }
  return p;
}
