import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAds, splitAds } from "../src/server/ingestion/textparse";

const NOW = new Date("2026-10-08T10:00:00Z");

test("splits blobs into ads by blank lines and bullets", () => {
  const ads = splitAds("Ташкент - Алматы 20т 25.10\n\nФергана - Москва 18 т 27.10\n\n- Бухара - Ташкент 22 т 28.10\n- Андижан - Казань 20 т 29.10");
  assert.equal(ads.length, 4);
});

test("parses a typical RU ad: route, weight, body, date, rate, payment, phone", () => {
  const [a] = parseAds("Ташкент - Алматы, 20т тент, загрузка 25.10, 1300$, нал на выгрузке, +998 90 123 45 67", "t", NOW);
  const l = a.listing!;
  assert.equal(l.origin, "tashkent");
  assert.equal(l.destination, "almaty");
  assert.equal(l.weight, 20000);
  assert.equal(l.bodyType, "curtainsider");
  assert.equal(new Date(l.loadingDate).toISOString().slice(0, 10), "2026-10-25");
  assert.equal(l.rate, 1300);
  assert.equal(l.currency, "USD");
  assert.equal(l.paymentTerms, "on_unloading");
  assert.match(l.contactPhone ?? "", /998 90 123 45 67/);
});

test("handles thousands separators, local currency, relative dates and conventional units", () => {
  const [s] = parseAds("Бухара - Ташкент хлопок 22 т тент 28.10 5 000 000 сум", "t", NOW);
  assert.equal(s.listing!.rate, 5_000_000);
  assert.equal(s.listing!.currency, "UZS");
  const [y] = parseAds("Самарканд-Бишкек 12т изотерм завтра 900 у.е.", "t", NOW);
  assert.equal(y.listing!.currency, "USD");
  assert.equal(new Date(y.listing!.loadingDate).toISOString().slice(0, 10), "2026-10-09");
});

test("rejects ads it can't understand and says why", () => {
  const [r] = parseAds("Неизвестный город - Алматы 10т 30.10", "t", NOW);
  assert.equal(r.listing, null);
  assert.ok(r.problems.some((p) => p.includes("city")));
});

test("parses Uzbek Cyrillic ads with case suffixes (-дан/-га), as actually posted in UZ Telegram groups", () => {
  const [a] = parseAds("Тошкентдан Алматига 20 тонна тент юк бор. Нарх 1500$. Юклаш 15.10", "t", NOW);
  assert.equal(a.listing?.origin, "tashkent");
  assert.equal(a.listing?.destination, "almaty");
  assert.equal(a.listing?.weight, 20000);
  assert.equal(a.listing?.rate, 1500);

  const [b] = parseAds("Бухородан Тошкентга 15 тонна реф юк бор, 12.10 га", "t", NOW);
  assert.equal(b.listing?.origin, "bukhara");
  assert.equal(b.listing?.destination, "tashkent");

  const [c] = parseAds("Самарқанддан Москвага 22 тонна тент, нарх 4500$, 14.10", "t", NOW);
  assert.equal(c.listing?.origin, "samarkand");
  assert.equal(c.listing?.destination, "moscow");
});

test("recognizes Uzbek Cyrillic date words (бугун/эртага)", () => {
  const [today] = parseAds("Тошкент - Самарқанд 10 тонна юк бор бугун", "t", NOW);
  assert.equal(today.listing?.loadingDate && new Date(today.listing.loadingDate).toISOString().slice(0, 10), "2026-10-08");
  const [tomorrow] = parseAds("Тошкент - Самарқанд 10 тонна юк бор эртага", "t", NOW);
  assert.equal(tomorrow.listing?.loadingDate && new Date(tomorrow.listing.loadingDate).toISOString().slice(0, 10), "2026-10-09");
});

test("ambiguous day.month dates resolve against the message's own time, not an unrelated later 'now'", () => {
  // Regression for a confirmed production bug: the Telegram ingest route used to parse ad text
  // with the real wall-clock ingestion time as "now", even for backfilled (days/weeks-old)
  // messages. A bare "21.07" (no year) found 30+ days after the fact triggers parseLoadingDate's
  // "already passed this year → must mean next year" heuristic — so a message actually posted
  // around 21 July, read during an October backfill, silently became a load for *next* July.
  // The fix: the ingest route now reconstructs "now" from the message's real postedAt. This
  // test pins the parser's side of that contract — given the CORRECT reference time (close to
  // the date actually written in the ad), the heuristic must NOT roll the year forward.
  const postedAroundTheDate = new Date("2026-08-01T10:00:00Z"); // ~10 days after 21.07 — same year
  const [a] = parseAds("Москва - Андижан 21 т тент 21.07 1000$", "t", postedAroundTheDate);
  assert.equal(new Date(a.listing!.loadingDate).toISOString().slice(0, 10), "2026-07-21");

  // Same ad text, but resolved with a "now" far removed from the actual post date (what the
  // old, buggy code path did by always using real-time ingestion "now") reproduces the bug —
  // documenting it rather than endorsing it: this is exactly the wrong input the route no
  // longer passes in.
  const unrelatedLaterNow = new Date("2026-10-12T13:31:00Z"); // the actual ingestion-time bug trigger
  const [b] = parseAds("Москва - Андижан 21 т тент 21.07 1000$", "t", unrelatedLaterNow);
  assert.equal(new Date(b.listing!.loadingDate).toISOString().slice(0, 10), "2027-07-21");
});

test("a message received today but actually posted months ago is dated from its own post time", () => {
  // Same bug class as above, phrased as the literal scenario: the listener backfills a group it
  // just joined, reading a message that sat there since the spring — "receiving" it today must
  // not mean "today" is the reference point for anything the ad text says.
  const postedInApril = new Date("2026-04-15T09:00:00Z");
  const [relative] = parseAds("Ташкент - Бухара 18 т тент завтра 800$", "t", postedInApril);
  // "завтра" (tomorrow) must mean the day after the message was posted (16 April), never
  // "tomorrow from whenever the backfill happens to run".
  assert.equal(new Date(relative.listing!.loadingDate).toISOString().slice(0, 10), "2026-04-16");
});

test("explicit years in the ad text are never overridden by the reference time", () => {
  const [a] = parseAds("Ташкент - Алматы 20 т тент 21.07.2027 1400$", "t", NOW); // NOW is Oct 2026
  assert.equal(new Date(a.listing!.loadingDate).toISOString().slice(0, 10), "2027-07-21");
  const [b] = parseAds("Ташкент - Алматы 20 т тент 05.03.26 1400$", "t", NOW); // 2-digit year
  assert.equal(new Date(b.listing!.loadingDate).toISOString().slice(0, 10), "2026-03-05");
});

test("a bare day.month posted right at the New Year boundary rolls forward correctly in the posting's own timezone-equivalent instant", () => {
  // "02.01" (2 January) posted in late December must mean "next January", a few days away —
  // not be misread using a UTC-vs-local-midnight slip. The heuristic only depends on the
  // reference time's UTC *year*, so a post time that is already on the other side of midnight
  // UTC (but still December in Tashkent, UTC+5) is the realistic edge case to pin.
  const postedLateDecemberUtc = new Date("2026-12-31T20:30:00Z"); // 2027-01-01 01:30 in Tashkent (UTC+5)
  const [a] = parseAds("Ташкент - Фергана 10 т тент 02.01 500$", "t", postedLateDecemberUtc);
  assert.equal(new Date(a.listing!.loadingDate).toISOString().slice(0, 10), "2027-01-02");
});

test("re-ingesting the identical message is idempotent: the parsed date for the same (text, postedAt) never drifts", () => {
  const postedAt = new Date("2026-07-21T09:00:00Z");
  const text = "Москва - Андижан 21 т тент 21.07 1000$";
  const first = parseAds(text, "t", postedAt)[0].listing!.loadingDate;
  const second = parseAds(text, "t", postedAt)[0].listing!.loadingDate;
  assert.equal(new Date(first).toISOString(), new Date(second).toISOString());
});

test("hostile input is parsed in linear time", () => {
  const t = Date.now();
  parseAds(`${"1 ".repeat(6000)}т`, "x", NOW);
  parseAds(`${"1,".repeat(6000)}$`, "x", NOW);
  assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
});
