/**
 * The rules that turn payment facts into a verdict. Pure (no database), so the shipper's reliability score and the
 * screens use exactly the same logic.
 */
export type PaymentStatus = "UNPAID" | "SHIPPER_PAID" | "CONFIRMED" | "DISPUTED";
const DAY = 86_400_000;

/** One day of slack: a transfer that lands the morning after the due date is still on time. */
export const PAY_GRACE_MS = 86_400_000;

interface TripTimes { startedAt: Date; completedAt: Date | null }

/** When payment is due, from the load's payment terms; null while it cannot be known (delivery not happened yet). */
export function paymentDueAt(terms: string | null | undefined, trip: TripTimes): Date | null {
  switch (terms) {
    case "PREPAID":
    case "ON_LOADING":
      return trip.startedAt;
    case "NET_7":
    case "NET_14":
    case "NET_30": {
      if (!trip.completedAt) return null;
      return new Date(trip.completedAt.getTime() + Number(terms.slice(4)) * DAY);
    }
    default: // ON_UNLOADING, or no terms stated
      return trip.completedAt;
  }
}

export type PaymentVerdict = "on-time" | "late" | "overdue" | "open" | "disputed" | "waiting";

/** Where a trip's payment stands against its due date. "waiting" = not due yet or not knowable yet. */
export function paymentVerdict(p: { status: string; paidAt: Date | null }, due: Date | null, now = new Date()): PaymentVerdict {
  if (p.status === "CONFIRMED") return due && p.paidAt && p.paidAt.getTime() > due.getTime() + PAY_GRACE_MS ? "late" : "on-time";
  if (p.status === "DISPUTED") return "disputed";
  if (!due) return "waiting";
  return now.getTime() > due.getTime() + PAY_GRACE_MS ? "overdue" : now.getTime() >= due.getTime() ? "open" : "waiting";
}

/** Does this verdict count as a payment sample for the shipper's reliability? (true = paid on time, false = not) */
export function paymentSample(v: PaymentVerdict): boolean | null {
  return v === "on-time" ? true : v === "late" || v === "overdue" || v === "disputed" ? false : null;
}

