import assert from "node:assert/strict";
import test from "node:test";
import { parseAd } from "../src/server/ingestion/textparse";

const now = new Date("2026-10-16T08:00:00Z");
const TEL = "+998901112299";
const parse = (s: string) => parseAd(s, 0, "t", now).listing;
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

test("rate: a date written right before the price is not part of the price", () => {
  for (const [ad, rate] of [
    [`Ташкент - Самарканд 20 т тент 19.10 900$ ${TEL}`, 900],
    [`Ташкент - Самарканд 20 т тент 19.10.2026 900$ ${TEL}`, 900],
    [`Ташкент - Самарканд 20 т тент 19/10 1 200$ ${TEL}`, 1200],
    [`Ташкент - Самарканд 20 т тент 19.10 1200 у.е. ${TEL}`, 1200],
    [`Ташкент - Самарканд 20 т тент 19.10 — 900 долл ${TEL}`, 900],
    [`Ташкент - Самарканд 20 т тент 19.10 цена 900 $ ${TEL}`, 900],
    [`Ташкент - Самарканд 20 т тент 19.10 $900 ${TEL}`, 900],
  ] as const) {
    const l = parse(ad);
    assert.ok(l, ad);
    assert.equal(l.rate, rate, ad);
    assert.equal(l.currency, "USD", ad);
    assert.equal(day(l.loadingDate), "2026-10-19", ad);
  }
});

test("rate: thousands may be written with a space, comma or dot; per-km quotes are not the price", () => {
  assert.equal(parse(`Ташкент - Самарканд 20 т тент завтра 1.200$ ${TEL}`)?.rate, 1200);
  assert.equal(parse(`Ташкент - Самарканд 20 т тент завтра 1,200$ ${TEL}`)?.rate, 1200);
  assert.equal(parse(`Ташкент - Москва 20 т тент 19.10 3 500$ ${TEL}`)?.rate, 3500);
  assert.equal(parse(`Ташкент - Самарканд 22т 19.10 8.5$/км 1900$ ${TEL}`)?.rate, 1900);
  assert.equal(parse(`Ташкент - Самарканд 20 т тент 19.10 договорная ${TEL}`)?.rate, null);
  assert.deepEqual([parse(`Ташкент - Самарканд 20 т тент 12.10 12 000 000 сум ${TEL}`)?.rate, parse(`Ташкент - Самарканд 20 т тент 12.10 12 000 000 сум ${TEL}`)?.currency], [12_000_000, "UZS"]);
});

test("date: a weight like 22.5 тонны is not a date", () => {
  const l = parse(`Москва - Самарканд Тент Вес: до 22.5 тонны Погрузка 25.10 ${TEL}`);
  assert.ok(l);
  assert.equal(day(l.loadingDate), "2026-10-25");
  assert.equal(l.weight, 22500);
  const l2 = parse(`Ташкент - Самарканд 20.5 т тент 19.10 900$ ${TEL}`);
  assert.equal(day(l2!.loadingDate), "2026-10-19");
  assert.equal(l2!.weight, 20500);
});

test("date: a price like 1.200$ before the real date does not hide it", () => {
  const l = parse(`Ташкент - Самарканд 20 т тент 1.200$ погрузка 21.10 ${TEL}`);
  assert.ok(l);
  assert.equal(day(l.loadingDate), "2026-10-21");
  assert.equal(l.rate, 1200);
});

test("date: no date but 'cargo ready' / 'urgent' loads on the day it was posted; no date at all is rejected", () => {
  const ready = parse(`Москва - Ташкент 22 т тент груз готов ${TEL}`);
  assert.equal(day(ready!.loadingDate), "2026-10-16");
  const urgent = parse(`СРОЧНО Москва - Ташкент 22 тонн тент ${TEL}`);
  assert.equal(day(urgent!.loadingDate), "2026-10-16");
  const none = parseAd(`Ташкент - Самарканд 22 тонн тент нужна машина ${TEL}`, 0, "t", now);
  assert.equal(none.listing, null);
  assert.ok(none.problems.length > 0);
});
