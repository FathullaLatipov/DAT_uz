export const PASSPORT_NUMBERS = ["cargoLengthM", "cargoWidthM", "cargoHeightM", "heightM", "widthM", "lengthM", "grossWeightKg", "axles", "axleLoadKg"] as const;

/** Passport values from a truck row (null = not known) as form text. */
export const passportText = (t: Partial<Record<(typeof PASSPORT_NUMBERS)[number], number | null>> & { adr?: boolean; crew?: number; fuelByCountry?: boolean }) => ({
  ...Object.fromEntries(PASSPORT_NUMBERS.map((k) => [k, t[k] == null ? "" : String(t[k])])) as Record<(typeof PASSPORT_NUMBERS)[number], string>,
  adr: !!t.adr,
  crew: t.crew === 2 ? 2 : 1,
  fuelByCountry: t.fuelByCountry !== false,
});
