import assert from "node:assert/strict";
import test from "node:test";
import { pageRange, pageWindow } from "../src/lib/pagination";

test("a short list shows every page", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
});

test("a long list shows the ends, the current page and its neighbours, with gaps marked", () => {
  assert.deepEqual(pageWindow(1, 50), [1, 2, "…", 50]);
  assert.deepEqual(pageWindow(25, 50), [1, "…", 24, 25, 26, "…", 50]);
  assert.deepEqual(pageWindow(50, 50), [1, "…", 49, 50]);
  assert.deepEqual(pageWindow(4, 50), [1, 2, 3, 4, 5, "…", 50]);
});

test("a gap of exactly one page shows that page, not an ellipsis", () => {
  assert.deepEqual(pageWindow(3, 10), [1, 2, 3, 4, "…", 10]);
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("the range of a page", () => {
  assert.deepEqual(pageRange(1, 50, 1240), { from: 1, to: 50 });
  assert.deepEqual(pageRange(25, 50, 1240), { from: 1201, to: 1240 });
  assert.deepEqual(pageRange(1, 50, 0), { from: 0, to: 0 });
  assert.deepEqual(pageRange(3, 25, 60), { from: 51, to: 60 });
});
