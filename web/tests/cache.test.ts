import assert from "node:assert/strict";
import test from "node:test";
import { clearMemos, memoize, ttlMemo } from "../src/server/cache";

test("memoize loads once per key within the ttl and shares one promise between concurrent callers", async () => {
  clearMemos();
  let calls = 0;
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return calls; };
  const [a, b] = await Promise.all([memoize("k1", 1000, load), memoize("k1", 1000, load)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(await memoize("k1", 1000, load), 1);
  assert.equal(calls, 1);
  assert.equal(await memoize("k2", 1000, load), 2); // another key loads on its own
});

test("an entry older than the ttl is loaded again", async () => {
  clearMemos();
  let calls = 0;
  const load = async () => ++calls;
  await memoize("ttl", 10, load);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(await memoize("ttl", 10, load), 2);
});

test("clearMemos drops everything at once (what every write path relies on)", async () => {
  clearMemos();
  let calls = 0;
  const get = ttlMemo("clear", 60_000, async () => ++calls);
  assert.equal(await get(), 1);
  assert.equal(await get(), 1);
  clearMemos();
  assert.equal(await get(), 2);
});

test("a failed load is not remembered", async () => {
  clearMemos();
  let calls = 0;
  const load = async () => { calls++; if (calls === 1) throw new Error("boom"); return "ok"; };
  await assert.rejects(memoize("fail", 1000, load), /boom/);
  assert.equal(await memoize("fail", 1000, load), "ok");
  assert.equal(calls, 2);
});

test("the store is bounded: many keys never pile up without limit", async () => {
  clearMemos();
  for (let n = 0; n < 1200; n++) await memoize(`org-${n}`, 60_000, async () => n);
  const g = globalThis as unknown as { __karvonMemos: Map<string, unknown> };
  assert.ok(g.__karvonMemos.size <= 500, `size ${g.__karvonMemos.size}`);
});

test("the board's cache key covers every filter that buildWhere reads", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/server/services/freight.ts", import.meta.url), "utf-8");
  const body = src.slice(src.indexOf("export function buildWhere"), src.indexOf("export function buildWhere") + 6000);
  const end = body.search(/\r?\n}\r?\n/);
  const used = new Set([...body.slice(0, end).matchAll(/\bf\.([a-zA-Z]+)/g)].map((m) => m[1]));
  const listed = new Set([...src.match(/const WHERE_FIELDS = \[([^\]]*)\]/)![1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]));
  for (const k of used) assert.ok(listed.has(k), `buildWhere reads f.${k} but it is not in WHERE_FIELDS (the cache would mix up different searches)`);
});
