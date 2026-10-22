import assert from "node:assert/strict";
import test from "node:test";
import { checkNewPassword, generateTempPassword, MIN_PASSWORD } from "../src/lib/password";

test("a temporary password has the documented shape and only unambiguous characters", () => {
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword();
    assert.match(p, /^[a-hj-km-np-zA-HJ-NP-Z2-9]{4}-[a-hj-km-np-zA-HJ-NP-Z2-9]{4}-[a-hj-km-np-zA-HJ-NP-Z2-9]{4}$/, p);
    assert.ok(p.length >= MIN_PASSWORD);
  }
});

test("temporary passwords do not repeat and use the whole alphabet", () => {
  const seen = new Set<string>();
  const chars = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const p = generateTempPassword();
    seen.add(p);
    for (const c of p.replace(/-/g, "")) chars.add(c);
  }
  assert.equal(seen.size, 2000);
  assert.ok(chars.size >= 50, `only ${chars.size} distinct characters in 24,000 draws`);
});

test("checkNewPassword names the first thing that is wrong", () => {
  assert.equal(checkNewPassword("short"), "TOO_SHORT");
  assert.equal(checkNewPassword("x".repeat(201)), "TOO_LONG");
  assert.equal(checkNewPassword("longenough1", { confirm: "different" }), "MISMATCH");
  assert.equal(checkNewPassword("longenough1", { current: "longenough1" }), "SAME_AS_OLD");
  assert.equal(checkNewPassword("longenough1", { current: "old-password", confirm: "longenough1" }), null);
});
