import type { FreightSourceAdapter, ParsedListing } from "../types";

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export const CSV_COLUMNS = [
  "external_id", "origin", "destination", "loading_date", "unloading_date", "cargo", "weight_kg",
  "volume_m3", "body_type", "rate", "currency", "payment_terms", "broker", "posted_at",
] as const;

export function csvRowToListing(r: Record<string, string>, idx: number): ParsedListing {
  return {
    externalId: r.external_id || `row-${idx + 1}`,
    origin: r.origin,
    destination: r.destination,
    loadingDate: r.loading_date,
    unloadingDate: r.unloading_date || null,
    cargo: r.cargo,
    weight: r.weight_kg,
    weightUnit: "kg",
    volume: r.volume_m3,
    bodyType: r.body_type,
    rate: r.rate,
    currency: r.currency,
    paymentTerms: r.payment_terms,
    broker: r.broker || undefined,
    postedAt: r.posted_at || undefined,
    raw: r,
  };
}

/** Manual import: an operator uploads a CSV in the admin panel (or the seed provides a demo file). */
export function manualImportAdapter(csvText: string, opts: { isDemo: boolean }): FreightSourceAdapter {
  return {
    descriptor: {
      id: "manual-import",
      name: "Manual CSV import",
      kind: "MANUAL",
      isDemo: opts.isDemo,
      accessNotes: "Operator-uploaded CSV. The uploader is responsible for having the right to use the data.",
    },
    isConfigured: () => true,
    async fetch() {
      return parseCsv(csvText).map(csvRowToListing);
    },
  };
}
