import assert from "node:assert/strict";
import test from "node:test";
import { navKeysFor } from "../src/lib/nav-items";

test("a company with trucks gets My routes instead of My loads", () => {
  const k = navKeysFor({ isBroker: false, hasTrucks: true, postsLoads: false });
  assert.ok(k.includes("myRoutes"));
  assert.ok(!k.includes("myLoads"));
  assert.ok(k.includes("fleet"));
});

test("a company without trucks keeps My loads and gets no routes", () => {
  const k = navKeysFor({ isBroker: false, hasTrucks: false, postsLoads: true });
  assert.ok(k.includes("myLoads"));
  assert.ok(!k.includes("myRoutes"));
});

test("a carrier that also posts loads keeps both, routes first", () => {
  const k = navKeysFor({ isBroker: false, hasTrucks: true, postsLoads: true });
  assert.ok(k.indexOf("myRoutes") < k.indexOf("myLoads"));
  assert.ok(k.includes("myRoutes") && k.includes("myLoads"));
});

test("everyone has Reviews; brokers have no fleet page; the order puts the primary four first", () => {
  for (const o of [{ isBroker: true, hasTrucks: false, postsLoads: true }, { isBroker: false, hasTrucks: true, postsLoads: false }, { isBroker: false, hasTrucks: false, postsLoads: false }]) {
    const k = navKeysFor(o);
    assert.ok(k.includes("reviews") && k.includes("settings") && k.includes("dashboard"));
    assert.equal(new Set(k).size, k.length, "no duplicates");
    assert.deepEqual(k.slice(0, 3), ["dashboard", "loadBoard", "aiDispatcher"]);
  }
  assert.ok(!navKeysFor({ isBroker: true, hasTrucks: false, postsLoads: false }).includes("fleet"));
});
