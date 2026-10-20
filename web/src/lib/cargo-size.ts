import type { I18n } from "@/i18n/create";

export interface CargoFacts {
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  oversize?: boolean | null;
  adrClass?: string | null;
}

/** "13.6 × 2.45 × 2.7 m · Oversize · ADR 3" parts for a load, empty when the ad says nothing of the kind. */
export function cargoFacts(o: CargoFacts, t: I18n["t"]): string[] {
  const out: string[] = [];
  const dims = [o.cargoLengthM, o.cargoWidthM, o.cargoHeightM];
  if (dims.every((d) => typeof d === "number" && d > 0)) out.push(`${dims.join(" × ")} m`);
  if (o.oversize) out.push(t("pass.cargoOversize"));
  if (o.adrClass) out.push(o.adrClass === "0" ? t("pass.cargoAdrAny") : t("pass.cargoAdr", { cls: o.adrClass }));
  return out;
}
