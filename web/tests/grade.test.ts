import assert from "node:assert/strict";
import test from "node:test";
import { gradeAtLeast, gradeFromScore, gradeOffer, type GradeInput } from "../src/server/services/grade";

const now = new Date("2026-10-16T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

const good: GradeInput = {
  now,
  loadingDate: new Date("2026-10-18T08:00:00Z"),
  rateUsd: 1200,
  qualityFlags: [],
  lastSeenAt: ago(0.5),
  brokerId: "b1",
  brokerVerified: true,
  listings: [
    { sourceId: "diip", sourceKind: "API", contactPhone: "+998901234567", lastSeenAt: ago(0.5) },
    { sourceId: "tg", sourceKind: "FEED", contactPhone: null, lastSeenAt: ago(1) },
  ],
};

test("grade: fresh, confirmed, verified broker and published rate is an A", () => {
  const g = gradeOffer(good);
  assert.equal(g.grade, "A");
  assert.ok(g.score >= 85);
});

test("grade: a suspicious rate caps the load at D whatever else is good", () => {
  const g = gradeOffer({ ...good, rateUsd: 6000, qualityFlags: ["SUSPICIOUS_RATE"] });
  assert.equal(g.grade, "D");
  assert.ok(g.reasons.some((r) => r.code === "rateSuspicious" && !r.good));
});

test("grade: a loading date that already passed caps the load at D", () => {
  const g = gradeOffer({ ...good, loadingDate: ago(24 * 5) });
  assert.equal(g.grade, "D");
  assert.ok(g.reasons.some((r) => r.code === "pastDate"));
});

test("grade: staleness lowers the grade step by step", () => {
  const fresh = gradeOffer(good).score;
  const day = gradeOffer({ ...good, lastSeenAt: ago(20), listings: good.listings.map((l) => ({ ...l, lastSeenAt: ago(20) })) }).score;
  const old = gradeOffer({ ...good, lastSeenAt: ago(24 * 10), listings: good.listings.map((l) => ({ ...l, lastSeenAt: ago(24 * 10) })) }).score;
  assert.ok(fresh > day && day > old);
});

test("grade: anonymous, single-source, negotiable posting without a phone is not better than C", () => {
  const g = gradeOffer({
    ...good, rateUsd: 0, brokerId: null, brokerVerified: false,
    listings: [{ sourceId: "tg", sourceKind: "FEED", contactPhone: null, lastSeenAt: ago(1) }],
  });
  assert.ok(g.grade === "C" || g.grade === "D");
  assert.ok(g.reasons.slice(0, 3).every((r) => !r.good), "bad news is listed first");
});

test("grade: boundaries and minGrade filter", () => {
  assert.deepEqual([100, 85, 84, 70, 69, 50, 49, 0].map(gradeFromScore), ["A", "A", "B", "B", "C", "C", "D", "D"]);
  assert.equal(gradeAtLeast("A", "B"), true);
  assert.equal(gradeAtLeast("C", "B"), false);
  assert.equal(gradeAtLeast("B", "B"), true);
});
