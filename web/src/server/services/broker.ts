import { unstable_cache } from "next/cache";
import { db } from "../db";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";

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

export function computeReliability(verified: boolean, reviews: ReviewLite[], completedTrips: number, i18n?: I18n): BrokerReliability {
  const { t, tn } = i18n ?? englishI18n();
  const n = reviews.length;
  const isDemo = reviews.some((r) => r.isDemo);
  if (n < MIN_REVIEWS) {
    return {
      score: null, sufficient: false, reviews: n, avgRating: n ? reviews.reduce((s, r) => s + r.rating, 0) / n : null,
      paidOnTimePct: null, disputePct: null, cancelPct: null, completedTrips, components: [], isDemo,
      explanation: tn("broker.insufficient", n, { min: MIN_REVIEWS }),
    };
  }
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / n;
  const payKnown = reviews.filter((r) => r.paidOnTime != null);
  const onTime = payKnown.length ? payKnown.filter((r) => r.paidOnTime).length / payKnown.length : null;
  const disputes = reviews.filter((r) => r.disputed).length / n;
  const cancels = reviews.filter((r) => r.cancelled).length / n;

  const components: ReliabilityComponent[] = [
    { key: "identity", label: t("broker.identity"), max: 20, points: verified ? 20 : 0, detail: verified ? t("broker.identityYes") : t("broker.identityNo") },
    { key: "rating", label: t("broker.rating"), max: 35, points: Math.round(((avg - 1) / 4) * 35), detail: tn("broker.ratingDetail", n, { avg: avg.toFixed(2) }) },
    {
      key: "payment", label: t("broker.payment"), max: 25,
      points: onTime == null ? 12 : Math.round(onTime * 25),
      detail: onTime == null ? t("broker.paymentNone") : tn("broker.paymentDetail", payKnown.length, { pct: Math.round(onTime * 100) }),
    },
    { key: "disputes", label: t("broker.disputes"), max: 10, points: Math.round((1 - Math.min(1, disputes * 4)) * 10), detail: t("broker.disputesDetail", { pct: Math.round(disputes * 100) }) },
    { key: "cancellations", label: t("broker.cancellations"), max: 10, points: Math.round((1 - Math.min(1, cancels * 4)) * 10), detail: t("broker.cancellationsDetail", { pct: Math.round(cancels * 100) }) },
  ];
  const score = components.reduce((s, c) => s + c.points, 0);
  return {
    score, sufficient: true, reviews: n, avgRating: Math.round(avg * 100) / 100,
    paidOnTimePct: onTime == null ? null : Math.round(onTime * 100), disputePct: Math.round(disputes * 100), cancelPct: Math.round(cancels * 100),
    completedTrips, components, isDemo,
    explanation: `${tn("broker.formula", n)}${isDemo ? ` ${t("broker.demoReviews")}` : ""}`,
  };
}

export async function brokerReliability(brokerId: string, i18n?: I18n): Promise<BrokerReliability | null> {
  const b = await db.broker.findUnique({
    where: { id: brokerId },
    include: { reviews: true, offers: { select: { trips: { where: { status: "COMPLETED" }, select: { id: true } } } } },
  });
  if (!b) return null;
  const trips = b.offers.reduce((s, o) => s + o.trips.length, 0);
  return computeReliability(b.verified, b.reviews, trips, i18n);
}

/**
 * Batch version for ranking many offers at once — called once per `getMatchContext()`, which
 * itself runs several times per dashboard/load-board request. Cached so those calls share one
 * table scan instead of repeating it. (unstable_cache round-trips through JSON, so this returns
 * entries, not a Map — a Map doesn't survive that serialization.)
 */
const brokerScoreEntriesCached = unstable_cache(
  async (): Promise<[string, BrokerReliability][]> => {
    const brokers = await db.broker.findMany({ include: { reviews: true } });
    return brokers.map((b) => [b.id, computeReliability(b.verified, b.reviews, 0)]);
  },
  ["broker-scores"],
  { revalidate: 120 },
);

export async function brokerScores(): Promise<Map<string, BrokerReliability>> {
  return new Map(await brokerScoreEntriesCached());
}
