import assert from "node:assert/strict";
import test from "node:test";
import { findRepost, phoneKey, textKey, type RepostCandidate } from "../src/server/ingestion/dedupe";

test("repost: phone numbers match across formats, short numbers are ignored", () => {
  assert.equal(phoneKey("+998 90 123-45-67"), phoneKey("901234567"));
  assert.equal(phoneKey("998901234567"), "901234567");
  assert.equal(phoneKey("12345"), null);
  assert.equal(phoneKey(null), null);
});

test("repost: text matches through spacing, emoji and case, but only when long enough to mean something", () => {
  const a = "🚛 Ташкент → Самарканд, 20 тонн, тент, завтра! Тел: +998 90 123 45 67";
  const b = "ташкент самарканд 20 тонн тент завтра тел 998901234567";
  assert.equal(textKey(a), textKey(b), "emoji, arrows, punctuation and spacing do not matter");
  assert.notEqual(textKey(a), textKey(b + " срочно"), "different wording is not the same text");
  assert.equal(textKey(a), textKey(a.toUpperCase().replace(/\s+/g, "  ")));
  assert.equal(textKey("Ташкент Самарканд"), null);
});

const cand: RepostCandidate = {
  id: "kept", weightKg: 20_000, bodyType: "CURTAINSIDER",
  listings: [{ phone: "901234567", text: textKey("Ташкент Самарканд 20 т тент завтра, звоните по телефону 901234567") }],
};

test("repost: the same phone on the same lane/day/weight/body is the same load", () => {
  assert.equal(findRepost({ weightKg: 20_000, bodyType: "CURTAINSIDER", phone: "901234567", text: null }, [cand]), "kept");
  assert.equal(findRepost({ weightKg: 19_500, bodyType: "BOX", phone: "901234567", text: null }, [cand]), "kept", "tent and box are one body family");
});

test("repost: a different weight, body family or phone is a different load", () => {
  assert.equal(findRepost({ weightKg: 10_000, bodyType: "CURTAINSIDER", phone: "901234567", text: null }, [cand]), null);
  assert.equal(findRepost({ weightKg: 20_000, bodyType: "REFRIGERATED", phone: "901234567", text: null }, [cand]), null);
  assert.equal(findRepost({ weightKg: 20_000, bodyType: "CURTAINSIDER", phone: "935556677", text: null }, [cand]), null);
});

test("repost: identical text matches even without a phone", () => {
  const t = textKey("Ташкент Самарканд 20 т тент завтра, звоните по телефону 901234567");
  assert.equal(findRepost({ weightKg: 20_000, bodyType: "CURTAINSIDER", phone: null, text: t }, [cand]), "kept");
  assert.equal(findRepost({ weightKg: 20_000, bodyType: "CURTAINSIDER", phone: null, text: null }, [cand]), null);
});
