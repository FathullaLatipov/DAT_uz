import assert from "node:assert/strict";
import test from "node:test";
import { mailtoUrl } from "../src/lib/mailto";
import { normalizeEmail } from "../src/server/ingestion/normalize";
import { findEmail, parseAd } from "../src/server/ingestion/textparse";
import { uniqueContacts } from "../src/server/services/contacts";

test("email: found in ad text, trailing punctuation dropped, validated", () => {
  assert.equal(findEmail("Звоните +998901234567 или пишите cargo@Example.com."), "cargo@Example.com");
  assert.equal(findEmail("нет почты"), undefined);
  assert.equal(normalizeEmail(" Cargo@Example.COM "), "cargo@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(undefined), null);
});

test("email: parsed ads carry it into the listing", () => {
  const ad = parseAd("Ташкент - Самарканд 20 т тент завтра 900$ тел +998901234567 mail: yuk@firma.uz", 0, "b", new Date("2026-10-16T08:00:00Z"));
  assert.equal(ad.listing?.contactEmail, "yuk@firma.uz");
});

test("mailto: address stays readable, subject and body are encoded with CRLF line breaks", () => {
  const u = mailtoUrl({ to: "cargo@example.com", subject: "Груз: Ташкент → Алматы", body: "Hello,\n\n1. Time & place?" });
  assert.ok(u.startsWith("mailto:cargo@example.com?subject="));
  assert.ok(u.includes("&body=Hello%2C%0D%0A%0D%0A1.%20Time%20%26%20place%3F"));
  assert.equal(decodeURIComponent(u.split("subject=")[1].split("&")[0]), "Груз: Ташкент → Алматы");
});

test("mailto: very long text is cut so the link still opens", () => {
  const u = mailtoUrl({ to: "a@b.co", subject: "x".repeat(500), body: "y".repeat(5000) });
  assert.ok(decodeURIComponent(u.split("body=")[1]).length <= 2000);
  assert.ok(decodeURIComponent(u.split("subject=")[1].split("&")[0]).length <= 200);
});

const L = (o: { name?: string; phone?: string; email?: string; src?: string; demo?: boolean; ago?: number }) => ({
  contactName: o.name ?? null, contactPhone: o.phone ?? null, contactEmail: o.email ?? null, sourceUrl: null,
  lastSeenAt: new Date(Date.now() - (o.ago ?? 0) * 60_000), source: { name: o.src ?? "S", isDemo: !!o.demo },
});

test("contacts: one row per distinct person, newest first, demo and empty ones skipped, capped", () => {
  const rows = [
    L({ phone: "+998 90 123 45 67", name: "Old", ago: 60 }),
    L({ phone: "901234567", name: "New", email: "a@b.uz", ago: 1 }),   // same number as the first → one row (the newer one)
    L({ email: "x@y.uz", ago: 5 }),
    L({ phone: "+998 93 555 66 77", demo: true }),                      // demo: hidden
    L({}),                                                              // nothing to show
  ];
  const c = uniqueContacts(rows);
  assert.deepEqual(c.map((x) => x.name ?? x.email), ["New", "x@y.uz"]);
  const many = Array.from({ length: 30 }, (_, i) => L({ phone: `+99890${String(1000000 + i)}` }));
  assert.equal(uniqueContacts(many).length, 6);
});
