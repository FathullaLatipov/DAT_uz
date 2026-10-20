export const PASSPORT_NUMBERS = ["cargoLengthM", "cargoWidthM", "cargoHeightM", "heightM", "widthM", "lengthM", "grossWeightKg", "axles", "axleLoadKg"] as const;

/** Passport values from a truck row (null = not known) as form text. */
export const passportText = (t: Partial<Record<(typeof PASSPORT_NUMBERS)[number], number | null>> & { adr?: boolean }) => ({
  ...Object.fromEntries(PASSPORT_NUMBERS.map((k) => [k, t[k] == null ? "" : String(t[k])])) as Record<(typeof PASSPORT_NUMBERS)[number], string>,
  adr: !!t.adr,
});
