import assert from "node:assert/strict";
import test from "node:test";
import { computeReliability } from "../src/server/services/broker";
import { PAY_GRACE_MS, paymentDueAt, paymentSample, paymentVerdict } from "../src/server/services/payment-rules";

const D = 86_400_000;
const started = new Date("2026-10-20T06:00:00Z");
const done = new Date("2026-10-22T10:00:00Z");
const trip = { startedAt: started, completedAt: done };

test("payment due date follows the load's terms", () => {
  assert.equal(paymentDueAt("PREPAID", trip)?.getTime(), started.getTime());
  assert.equal(paymentDueAt("ON_LOADING", trip)?.getTime(), started.getTime());
  assert.equal(paymentDueAt("ON_UNLOADING", trip)?.getTime(), done.getTime());
  assert.equal(paymentDueAt(null, trip)?.getTime(), done.getTime(), "no terms means on unloading");
  assert.equal(paymentDueAt("NET_7", trip)?.getTime(), done.getTime() + 7 * D);
  assert.equal(paymentDueAt("NET_30", trip)?.getTime(), done.getTime() + 30 * D);
  assert.equal(paymentDueAt("NET_14", { startedAt: started, completedAt: null }), null, "unknown until delivered");
});

test("payment verdict: on time within a day of slack, late after it; open, overdue, disputed, waiting", () => {
  const due = done;
  const at = (ms: number) => new Date(due.getTime() + ms);
  assert.equal(paymentVerdict({ status: "CONFIRMED", paidAt: at(-3 * D) }, due), "on-time");
  assert.equal(paymentVerdict({ status: "CONFIRMED", paidAt: at(PAY_GRACE_MS - 1000) }, due), "on-time");
  assert.equal(paymentVerdict({ status: "CONFIRMED", paidAt: at(PAY_GRACE_MS + 1000) }, due), "late");
  assert.equal(paymentVerdict({ status: "UNPAID", paidAt: null }, due, at(-D)), "waiting");
  assert.equal(paymentVerdict({ status: "UNPAID", paidAt: null }, due, at(1000)), "open");
  assert.equal(paymentVerdict({ status: "SHIPPER_PAID", paidAt: null }, due, at(2 * D)), "overdue");
  assert.equal(paymentVerdict({ status: "DISPUTED", paidAt: null }, due, at(-D)), "disputed");
  assert.equal(paymentVerdict({ status: "UNPAID", paidAt: null }, null), "waiting");
});

test("only decided payments become a reliability sample", () => {
  assert.equal(paymentSample("on-time"), true);
  for (const v of ["late", "overdue", "disputed"] as const) assert.equal(paymentSample(v), false, v);
  for (const v of ["open", "waiting"] as const) assert.equal(paymentSample(v), null, v);
});

const rev = (rating: number, paidOnTime: boolean | null = null) => ({ rating, paidOnTime, disputed: false, cancelled: false, isDemo: false });

test("reliability: real payment outcomes feed the payment record, before and after the score is shown", () => {
  const few = computeReliability(false, [rev(5)], 1, undefined, [true, true, false]);
  assert.equal(few.sufficient, false);
  assert.equal(few.paidOnTimePct, 67, "shown from the first payments, even while the score is withheld");

  const enough = computeReliability(true, [rev(5), rev(4), rev(5)], 3, undefined, [true, true, true, false]);
  assert.equal(enough.sufficient, true);
  assert.equal(enough.paidOnTimePct, 75);
  const pay = enough.components.find((c) => c.key === "payment")!;
  assert.equal(pay.points, Math.round(0.75 * 25));

  const none = computeReliability(true, [rev(5), rev(4), rev(5)], 3);
  assert.equal(none.paidOnTimePct, null);
  assert.equal(none.components.find((c) => c.key === "payment")!.points, 12, "unknown payment is neutral, as before");
});
