/**
 * Load grade (A–D), the DAT-style "how much can I trust this posting" letter.
 *
 * Computed on read from facts we already store — no schema change, so it always reflects
 * the current time. The letter is a summary; `reasons` says what pushed it up or down,
 * and the same codes drive the tooltip in the UI.
 *
 *   Freshness 30 · Rate 20 · Broker 20 · Sources 15 · Completeness 15  = 100
 *   A ≥ 85 · B ≥ 70 · C ≥ 50 · D < 50
 *
 * Hard caps (a good score elsewhere can't hide these): a suspicious rate/weight/date, or a
 * loading date that already passed, caps the load at D.
 */

export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];

export type GradeReason =
  | "fresh" | "recent" | "stale" | "oldSighting"
  | "pastDate"
  | "rateOk" | "rateNegotiable" | "rateSuspicious"
  | "brokerVerified" | "brokerKnown" | "brokerUnknown"
  | "multiSource" | "singleSource" | "trustedSource"
  | "contact" | "noContact"
  | "flagged";

export interface GradeInput {
  now?: Date;
  loadingDate: Date;
  rateUsd: number;
  qualityFlags: string[];
  /** Most recent sighting by any source. */
  lastSeenAt: Date;
  brokerId: string | null;
  brokerVerified?: boolean;
  /** Broker reliability 0–100 from completed trips and reviews, when we have it. */
  brokerScore?: number | null;
  listings: { sourceId: string; sourceKind?: string; contactPhone?: string | null; lastSeenAt?: Date }[];
  cargoKnown?: boolean;
}

export interface GradeResult {
  grade: Grade;
  score: number;
  /** Positive and negative factors, strongest first. */
  reasons: { code: GradeReason; good: boolean }[];
}

const HOUR = 3_600_000;
const SERIOUS = ["SUSPICIOUS_RATE", "SUSPICIOUS_WEIGHT", "IMPOSSIBLE_DATES", "INVALID_CURRENCY"];

export const gradeFromScore = (s: number): Grade => (s >= 85 ? "A" : s >= 70 ? "B" : s >= 50 ? "C" : "D");
/** `minGrade=B` keeps A and B. */
export const gradeAtLeast = (g: Grade, min: Grade) => GRADES.indexOf(g) <= GRADES.indexOf(min);

export function gradeOffer(i: GradeInput): GradeResult {
  const now = (i.now ?? new Date()).getTime();
  const reasons: GradeResult["reasons"] = [];
  const add = (code: GradeReason, good: boolean) => reasons.push({ code, good });
  let score = 0;

  // Freshness (30): when did any source last confirm it?
  const seen = Math.max(i.lastSeenAt.getTime(), ...i.listings.map((l) => l.lastSeenAt?.getTime() ?? 0));
  const age = now - seen;
  if (age <= 2 * HOUR) { score += 30; add("fresh", true); }
  else if (age <= 8 * HOUR) { score += 24; add("recent", true); }
  else if (age <= 24 * HOUR) { score += 14; add("stale", false); }
  else if (age <= 72 * HOUR) { score += 6; add("stale", false); }
  else add("oldSighting", false);

  const pastDate = i.loadingDate.getTime() < now - 24 * HOUR;
  if (pastDate) add("pastDate", false);

  // Rate (20): published and plausible beats negotiable beats nonsense.
  const suspiciousRate = i.qualityFlags.includes("SUSPICIOUS_RATE");
  if (i.rateUsd > 0 && !suspiciousRate) { score += 20; add("rateOk", true); }
  else if (suspiciousRate) add("rateSuspicious", false);
  else { score += 8; add("rateNegotiable", false); }

  // Broker (20): a verified company, then a known one with track record, then anonymous.
  if (i.brokerId && i.brokerVerified) { score += 20; add("brokerVerified", true); }
  else if (i.brokerId) {
    score += i.brokerScore != null ? Math.round(6 + (Math.min(Math.max(i.brokerScore, 0), 100) / 100) * 9) : 10;
    add("brokerKnown", true);
  } else add("brokerUnknown", false);

  // Sources (15): independent confirmation is the strongest signal we have.
  const sourceIds = new Set(i.listings.map((l) => l.sourceId));
  const kinds = new Set(i.listings.map((l) => l.sourceKind));
  if (sourceIds.size >= 3) { score += 15; add("multiSource", true); }
  else if (sourceIds.size === 2) { score += 12; add("multiSource", true); }
  else if (kinds.has("PLATFORM") || kinds.has("PARTNER")) { score += 12; add("trustedSource", true); }
  else if (kinds.has("API")) { score += 9; add("singleSource", false); }
  else { score += 5; add("singleSource", false); }

  // Completeness (15): can a carrier actually act on it?
  const hasContact = i.listings.some((l) => !!l.contactPhone);
  if (hasContact) { score += 9; add("contact", true); } else add("noContact", false);
  score += i.cargoKnown === false ? 0 : 3;
  score += i.qualityFlags.includes("UNKNOWN_BODY_TYPE") ? 0 : 3;

  const flagged = i.qualityFlags.some((f) => SERIOUS.includes(f) && f !== "SUSPICIOUS_RATE");
  if (flagged) add("flagged", false);

  score = Math.max(0, Math.min(100, score));
  if (suspiciousRate || flagged || pastDate) score = Math.min(score, 39);

  // Bad news first so the tooltip leads with what to double-check.
  reasons.sort((a, b) => Number(a.good) - Number(b.good));
  return { grade: gradeFromScore(score), score, reasons };
}
