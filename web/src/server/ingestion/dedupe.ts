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
