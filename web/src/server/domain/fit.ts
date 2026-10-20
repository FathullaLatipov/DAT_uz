import type { BodyType, TruckType } from "./enums";

/**
 * Does this cargo physically and legally fit this truck? Pure and deterministic.
 * Unknown values (null/undefined) never block: a truck without a passport or an ad without a size is
 * reported as "cannot check", not as a mismatch.
 */

export interface TruckPassport {
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  grossWeightKg?: number | null;
  adr?: boolean | null;
}

export interface CargoSize {
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  oversize?: boolean | null;
  adrClass?: string | null;
  /** Free-text requirements of the ad; "ADR" in them counts as dangerous goods. */
  requirements?: string[];
}

export type FitCode = "TOO_LONG" | "TOO_WIDE" | "TOO_HIGH" | "NEEDS_ADR" | "OVERSIZE" | "NO_PASSPORT";
export interface FitIssue { code: FitCode; cargo?: number; truck?: number }
export interface FitResult { blockers: FitIssue[]; warnings: FitIssue[]; /** false when the ad has a size/ADR the truck's data cannot answer */ checked: boolean }

const ADR_WORD = /(?<![\p{L}\d])adr(?![\p{L}])|опасн|xavfli/iu;
export const needsAdr = (c: Pick<CargoSize, "adrClass" | "requirements">) => !!c.adrClass || (c.requirements ?? []).some((r) => ADR_WORD.test(r));

const has = (n: number | null | undefined): n is number => typeof n === "number" && n > 0;

export function checkFit(truck: TruckPassport, cargo: CargoSize): FitResult {
  const blockers: FitIssue[] = [];
  const warnings: FitIssue[] = [];
  let checked = true;
  const dim = (code: FitCode, need: number | null | undefined, have: number | null | undefined) => {
    if (!has(need)) return;
    if (!has(have)) { checked = false; return; }
    if (need > have + 0.005) blockers.push({ code, cargo: need, truck: have });
  };
  dim("TOO_LONG", cargo.cargoLengthM, truck.cargoLengthM);
  dim("TOO_WIDE", cargo.cargoWidthM, truck.cargoWidthM);
  dim("TOO_HIGH", cargo.cargoHeightM, truck.cargoHeightM);
  if (needsAdr(cargo) && !truck.adr) blockers.push({ code: "NEEDS_ADR" });
  if (cargo.oversize) warnings.push({ code: "OVERSIZE" });
  if (!checked) warnings.push({ code: "NO_PASSPORT" });
  return { blockers, warnings, checked };
}

/** Typical values for the one-click "fill in" button; a starting point the carrier then corrects. */
export interface TypicalPassport {
  cargoLengthM: number; cargoWidthM: number; cargoHeightM: number;
  heightM: number; widthM: number; lengthM: number;
  grossWeightKg: number; axles: number; axleLoadKg: number;
}
export function typicalPassport(truckType: TruckType | string, bodyType: BodyType | string): TypicalPassport {
  const low = bodyType === "LOWBED";
  switch (truckType) {
    case "SEMI":
      return low
        ? { cargoLengthM: 12, cargoWidthM: 2.5, cargoHeightM: 3, heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightKg: 40000, axles: 5, axleLoadKg: 10000 }
        : { cargoLengthM: 13.6, cargoWidthM: 2.45, cargoHeightM: 2.7, heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightKg: 40000, axles: 5, axleLoadKg: 10000 };
    case "ROAD_TRAIN":
      return { cargoLengthM: 15.6, cargoWidthM: 2.45, cargoHeightM: 2.7, heightM: 4, widthM: 2.55, lengthM: 18.75, grossWeightKg: 44000, axles: 6, axleLoadKg: 10000 };
    case "VAN":
      return { cargoLengthM: 4.2, cargoWidthM: 2.1, cargoHeightM: 2.1, heightM: 2.8, widthM: 2.2, lengthM: 6.5, grossWeightKg: 5000, axles: 2, axleLoadKg: 3000 };
    default:
      return { cargoLengthM: 7.2, cargoWidthM: 2.45, cargoHeightM: 2.5, heightM: 3.6, widthM: 2.55, lengthM: 9.5, grossWeightKg: 18000, axles: 2, axleLoadKg: 10000 };
  }
}

/**
 * Cargo size, oversize and dangerous-goods class from the text of an ad.
 * "13.6x2.45x2.7", "габариты 6 х 2,4 х 2,5 м", "негабарит", "ADR 3", "опасный груз класс 8".
 */
export function parseCargoSize(text: string): { lengthM?: number; widthM?: number; heightM?: number; oversize: boolean; adrClass?: string } {
  const out: { lengthM?: number; widthM?: number; heightM?: number; oversize: boolean; adrClass?: string } = { oversize: /негабарит|нестандарт|gabaritsiz|oversize|out ?of ?gauge/iu.test(text) };
  const n = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)`;
  const sep = String.raw`\s?[x×хХ*]\s?`;
  const m = text.match(new RegExp(`(?<![\\d.,])${n}${sep}${n}${sep}${n}(?![\\d])`, "iu"));
  if (m) {
    const [l, w, h] = [m[1], m[2], m[3]].map((v) => parseFloat(v.replace(",", ".")));
    // Plausible metres only: a ratio like "20x10x5" in another unit must not become a cargo size.
    if ([l, w, h].every((v) => v > 0.1 && v <= 30) && l >= w && l >= h) Object.assign(out, { lengthM: l, widthM: w, heightM: h });
  }
  const adr = text.match(/(?<![\p{L}\d])adr(?![\p{L}])\s*(?:класс|class|klass|sinf)?\s*([1-9])?|опасн\p{L}*\s+груз\p{L}*\s*(?:класс|class)?\s*([1-9])?/iu);
  if (adr) out.adrClass = adr[1] ?? adr[2] ?? "0";
  return out;
}
