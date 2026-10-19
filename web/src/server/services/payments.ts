import { db } from "../db";
import { postingOrgIds } from "./load-owner";
import { notifyUser, RECIPIENT_SELECT } from "./notify-user";
import { paymentDueAt, paymentVerdict } from "./payment-rules";

/**
 * Payment for a load, followed by both sides.
 *
 *   UNPAID ──shipper: "I paid"──▶ SHIPPER_PAID ──carrier: "received"──▶ CONFIRMED
 *      └────────carrier: "received" (shipper did not mark it)───────────▲
 *      └──carrier: "not paid" ──▶ DISPUTED ──(later) "received" ────────▲
 *
 * Whether it was on time is an objective fact: the carrier's confirmation against the due date from the load's
 * payment terms. It feeds the shipper's reliability score, replacing the self-reported "paid on time" tick.
 */
export type PaymentAction = "paid" | "received" | "dispute";

const DAY = 86_400_000;

async function usersOf(orgIds: string[]) {
  if (!orgIds.length) return [];
  const members = await db.membership.findMany({ where: { orgId: { in: orgIds } }, select: { user: { select: RECIPIENT_SELECT } } });
  return members.map((m) => m.user);
}

type TripCtx = { id: string; orgId: string; offerId: string | null; status: string; paymentStatus: string; revenueUsd: number; originCityId: string; destCityId: string; startedAt: Date; completedAt: Date | null };

/**
 * Applies one payment step on behalf of `orgId`, which must be the carrier (received, dispute) or a company that
 * posted the load (paid). Returns what to tell the caller if it cannot be done.
 */
export async function applyPayment(trip: TripCtx, orgId: string, action: PaymentAction, note?: string) {
  const owners = trip.offerId ? await postingOrgIds(trip.offerId) : [];
  const isCarrier = trip.orgId === orgId;
  const isShipper = owners.includes(orgId);
  if (!isCarrier && !isShipper) return { error: "not-found" as const };
  if (trip.status === "CANCELLED") return { error: "cancelled" as const };
  const now = new Date();

  if (action === "paid") {
    if (!isShipper) return { error: "forbidden" as const };
    const r = await db.trip.updateMany({ where: { id: trip.id, paymentStatus: { in: ["UNPAID", "DISPUTED"] } }, data: { paymentStatus: "SHIPPER_PAID", shipperPaidAt: now } });
    if (r.count === 0) return { error: "state" as const };
    await tell(await usersOf([trip.orgId]), trip, "paid");
  } else if (action === "received") {
    if (!isCarrier) return { error: "forbidden" as const };
    const r = await db.trip.updateMany({ where: { id: trip.id, paymentStatus: { in: ["UNPAID", "SHIPPER_PAID", "DISPUTED"] } }, data: { paymentStatus: "CONFIRMED", paidAt: now, disputeNote: null } });
    if (r.count === 0) return { error: "state" as const };
    await tell(await usersOf(owners), trip, "received");
  } else {
    if (!isCarrier) return { error: "forbidden" as const };
    if (trip.status !== "COMPLETED") return { error: "not-delivered" as const };
    const r = await db.trip.updateMany({ where: { id: trip.id, paymentStatus: { in: ["UNPAID", "SHIPPER_PAID"] } }, data: { paymentStatus: "DISPUTED", disputeNote: note?.trim() || null } });
    if (r.count === 0) return { error: "state" as const };
    await tell(await usersOf(owners), trip, "dispute");
  }
  return { ok: true as const };
}

type Event = "paid" | "received" | "dispute" | "due" | "overdue";

/** Tells the other side, in each person's language and on every channel they use. */
async function tell(users: Awaited<ReturnType<typeof usersOf>>, trip: TripCtx, event: Event, extra: { carrier?: string; shipper?: string; due?: Date | null } = {}) {
  for (const u of users) {
    await notifyUser(u, (i) => {
      const route = `${i.city(trip.originCityId)} → ${i.city(trip.destCityId)}`;
      const amount = i.usd(trip.revenueUsd);
      const vars = { route, amount, carrier: extra.carrier ?? "", shipper: extra.shipper ?? "", date: extra.due ? i.shortDate(extra.due) : "" };
      return {
        title: i.t(`pay.${event}Title`, vars),
        body: i.t(`pay.${event}Body`, vars),
        // Only "I paid" goes to the carrier (to their trucks); everything else goes to the shipper (to their loads).
        link: event === "paid" ? "/app/fleet" : `/app/my-loads#load-${trip.offerId}`,
        button: i.t("pay.open"),
      };
    });
  }
}

/**
 * Daily: remind the shipper of payments that are due, and once more when they are overdue. At most two reminders
 * per trip, never for a payment already marked as sent or confirmed.
 */
export async function sendPaymentReminders(now = new Date()) {
  const trips = await db.trip.findMany({
    where: { status: "COMPLETED", paymentStatus: "UNPAID", remindCount: { lt: 2 }, offerId: { not: null }, completedAt: { gte: new Date(now.getTime() - 60 * DAY) } },
    include: { offer: { select: { paymentTerms: true } }, org: { select: { name: true } } },
    take: 500,
  });
  let sent = 0;
  for (const t of trips) {
    const due = paymentDueAt(t.offer?.paymentTerms, t);
    const v = paymentVerdict({ status: t.paymentStatus, paidAt: t.paidAt }, due, now);
    const event = v === "overdue" && t.remindCount < 2 ? "overdue" : v === "open" && t.remindCount < 1 ? "due" : null;
    if (!event || (t.remindedAt && now.getTime() - t.remindedAt.getTime() < DAY)) continue;
    const owners = await postingOrgIds(t.offerId!);
    if (!owners.length) continue;
    await tell(await usersOf(owners), t, event, { carrier: t.org.name, due });
    await db.trip.update({ where: { id: t.id }, data: { remindedAt: now, remindCount: { increment: 1 } } });
    sent++;
  }
  return { checked: trips.length, reminded: sent };
}
