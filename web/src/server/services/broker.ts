import { db } from "../db";

/**
 * Broker reliability is computed ONLY from data on the platform: identity verification,
 * reviews left by carriers after trips, and completed trips. Below the minimum sample
 * size the score is withheld rather than guessed.
 */
export const MIN_REVIEWS = 3;

export interface ReliabilityComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface BrokerReliability {
  score: number | null;
  sufficient: boolean;
  reviews: number;
  avgRating: number | null;
  paidOnTimePct: number | null;
  disputePct: number | null;
  cancelPct: number | null;
  completedTrips: number;
  components: ReliabilityComponent[];
  explanation: string;
  isDemo: boolean;
}

type ReviewLite = { rating: number; paidOnTime: boolean | null; disputed: boolean; cancelled: boolean; isDemo: boolean };

export function computeReliability(verified: boolean, reviews: ReviewLite[], completedTrips: number): BrokerReliability {
  const n = reviews.length;
  const isDemo = reviews.some((r) => r.isDemo);
  if (n < MIN_REVIEWS) {
    return {
      score: null, sufficient: false, reviews: n, avgRating: n ? reviews.reduce((s, r) => s + r.rating, 0) / n : null,
      paidOnTimePct: null, disputePct: null, cancelPct: null, completedTrips, components: [], isDemo,
      explanation: `Insufficient history: ${n} review${n === 1 ? "" : "s"} on the platform (minimum ${MIN_REVIEWS}). No score is shown until enough verified activity exists.`,
    };
  }
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / n;
  const payKnown = reviews.filter((r) => r.paidOnTime != null);
  const onTime = payKnown.length ? payKnown.filter((r) => r.paidOnTime).length / payKnown.length : null;
  const disputes = reviews.filter((r) => r.disputed).length / n;
  const cancels = reviews.filter((r) => r.cancelled).length / n;

  const components: ReliabilityComponent[] = [
    { key: "identity", label: "Verified identity", max: 20, points: verified ? 20 : 0, detail: verified ? "Identity verified" : "Not verified" },
    { key: "rating", label: "Carrier ratings", max: 35, points: Math.round(((avg - 1) / 4) * 35), detail: `${avg.toFixed(2)} / 5 from ${n} reviews` },
    {
      key: "payment", label: "Payment behaviour", max: 25,
      points: onTime == null ? 12 : Math.round(onTime * 25),
      detail: onTime == null ? "No payment data — neutral" : `${Math.round(onTime * 100)}% paid on time (${payKnown.length} reports)`,
    },
    { key: "disputes", label: "Disputes", max: 10, points: Math.round((1 - Math.min(1, disputes * 4)) * 10), detail: `${Math.round(disputes * 100)}% of trips disputed` },
    { key: "cancellations", label: "Cancellations", max: 10, points: Math.round((1 - Math.min(1, cancels * 4)) * 10), detail: `${Math.round(cancels * 100)}% cancelled` },
  ];
  const score = components.reduce((s, c) => s + c.points, 0);
  return {
    score, sufficient: true, reviews: n, avgRating: Math.round(avg * 100) / 100,
    paidOnTimePct: onTime == null ? null : Math.round(onTime * 100), disputePct: Math.round(disputes * 100), cancelPct: Math.round(cancels * 100),
    completedTrips, components, isDemo,
    explanation: `Score = identity (20) + carrier ratings (35) + on-time payment (25) + low disputes (10) + low cancellations (10), computed from ${n} carrier reviews on this platform${isDemo ? " (DEMO reviews)" : ""}.`,
  };
}

export async function brokerReliability(brokerId: string): Promise<BrokerReliability | null> {
  const b = await db.broker.findUnique({
    where: { id: brokerId },
    include: { reviews: true, offers: { select: { trips: { where: { status: "COMPLETED" }, select: { id: true } } } } },
  });
  if (!b) return null;
  const trips = b.offers.reduce((s, o) => s + o.trips.length, 0);
  return computeReliability(b.verified, b.reviews, trips);
}

/** Batch version for ranking many offers at once. */
export async function brokerScores(): Promise<Map<string, BrokerReliability>> {
  const brokers = await db.broker.findMany({ include: { reviews: true } });
  return new Map(brokers.map((b) => [b.id, computeReliability(b.verified, b.reviews, 0)]));
}
