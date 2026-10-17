import type { NormalizedOffer } from "./types";

const BODY_FAMILY: Record<string, string> = {
  CURTAINSIDER: "DRY",
  BOX: "DRY",
  OPEN: "OPEN",
  FLATBED: "OPEN",
  REFRIGERATED: "REEFER",
};
const family = (b: string) => BODY_FAMILY[b] ?? b;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Exact fingerprint: origin + destination + loading day + weight (500 kg bucket) + body family + broker.
 * Catches the common case of the same load reposted on several boards.
 */
export function fingerprint(o: Pick<NormalizedOffer, "originCityId" | "destCityId" | "loadingDate" | "weightKg" | "bodyType" | "brokerKey">) {
  return [
    o.originCityId,
    o.destCityId,
    day(o.loadingDate),
    Math.round(o.weightKg / 500) * 500,
    family(o.bodyType),
    o.brokerKey ?? "-",
  ].join("|");
}

export interface DedupCandidate {
  id: string;
  originCityId: string;
  destCityId: string;
  loadingDate: Date;
  weightKg: number;
  bodyType: string;
  rateUsd: number;
  cargoType: string;
  brokerKey: string | null;
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
export const stringSimilarity = (a: string, b: string) =>
  1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

/**
 * Fuzzy similarity in [0,1] between an incoming offer and an existing one on the same lane.
 * Signals: loading date proximity, weight, body family, cargo, rate, broker name.
 * Same-lane is a precondition (callers pre-filter by origin/destination).
 */
export function similarity(n: NormalizedOffer, c: DedupCandidate): number {
  if (n.originCityId !== c.originCityId || n.destCityId !== c.destCityId) return 0;
  const dayDiff = Math.abs(n.loadingDate.getTime() - c.loadingDate.getTime()) / 86_400_000;
  if (dayDiff > 1.01) return 0;

  const dateScore = dayDiff < 0.5 ? 1 : 0.6;
  const weightScore = Math.max(0, 1 - Math.abs(n.weightKg - c.weightKg) / Math.max(n.weightKg, c.weightKg) / 0.1);
  const bodyScore = family(n.bodyType) === family(c.bodyType) ? 1 : 0;
  const cargoScore = n.cargoType === c.cargoType ? 1 : 0.5;
  const rateScore =
    n.rateUsd == null || !c.rateUsd ? 0.7 : Math.max(0, 1 - Math.abs(n.rateUsd - c.rateUsd) / c.rateUsd / 0.15);
  const brokerScore =
    n.brokerKey && c.brokerKey ? stringSimilarity(n.brokerKey, c.brokerKey) : 0.6; // unknown broker: neutral

  return (
    dateScore * 0.2 + weightScore * 0.2 + bodyScore * 0.15 + cargoScore * 0.1 + rateScore * 0.15 + brokerScore * 0.2
  );
}

export const DUPLICATE_THRESHOLD = 0.82;

export function findDuplicate(n: NormalizedOffer, candidates: DedupCandidate[]) {
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const s = similarity(n, c);
    if (s >= DUPLICATE_THRESHOLD && (!best || s > best.score)) best = { id: c.id, score: s };
  }
  return best;
}

// ───────────── Reposts ─────────────
// The same ad is posted again and again — in one Telegram group and across many — each time as a new
// message with a new id. The fingerprint above can't catch that (it includes the broker, and for
// Telegram the "broker" is the group's name), so these two signals decide it instead: the same phone
// number, or the same text, on the same lane, day, weight and body.

/** Last 9 digits of a phone number (country code and formatting dropped); null if too short to mean anything. */
export function phoneKey(p?: string | null): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-9) : null;
}

/** Ad text reduced to letters and digits, so reposts that differ in spacing, emoji or case still match. */
export function textKey(t?: string | null): string | null {
  const k = (t ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return k.length >= 30 ? k : null;
}

export interface RepostCandidate {
  id: string;
  weightKg: number;
  bodyType: string;
  listings: { phone: string | null; text: string | null }[];
}

/** The existing offer (same lane and day, already filtered by the caller) this posting repeats, if any. */
export function findRepost(
  n: { weightKg: number; bodyType: string; phone: string | null; text: string | null },
  candidates: RepostCandidate[],
): string | null {
  for (const c of candidates) {
    if (family(n.bodyType) !== family(c.bodyType)) continue;
    if (Math.abs(n.weightKg - c.weightKg) / Math.max(n.weightKg, c.weightKg, 1) > 0.05) continue;
    const same = c.listings.some((l) => (n.phone && l.phone === n.phone) || (n.text && l.text === n.text));
    if (same) return c.id;
  }
  return null;
}
