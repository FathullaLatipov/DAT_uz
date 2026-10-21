/**
 * Tiny in-process cache for data every request needs and that changes slowly (the set of active offers the
 * matcher scans). One Node process serves the app, so a short TTL turns "re-read thousands of rows and rebuild
 * their objects on every page view" into one read every few seconds; `clearMemos()` (called from
 * `invalidateMarketCache()`, which every write path already calls) drops them at once after a change.
 *
 * The state lives on `globalThis` so route handlers and pages share it even if the bundler gives each entry its own
 * copy of this module.
 */
interface Slot { at: number; value: Promise<unknown> }
const g = globalThis as unknown as { __karvonMemos?: Map<string, Slot> };
const slots = () => (g.__karvonMemos ??= new Map<string, Slot>());

const MAX_SLOTS = 500;

/** `load()` once per `key` per `ttlMs`; concurrent callers share the same promise. */
export function memoize<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = slots().get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  if (slots().size >= MAX_SLOTS) slots().clear(); // keyed entries (one per org) must not pile up
  const value = load();
  const slot: Slot = { at: Date.now(), value };
  slots().set(key, slot);
  // A failed load must not be remembered.
  value.catch(() => { if (slots().get(key) === slot) slots().delete(key); });
  return value;
}

export function ttlMemo<T>(key: string, ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  return () => memoize(key, ttlMs, load);
}

/**
 * A small named cache for expensive, shareable query results keyed by their parameters (e.g. the load board's
 * rows for one filter set). At most `maxEntries` are kept (oldest dropped), each for `ttlMs`; `clearMemos()` empties
 * them too.
 */
const g2 = globalThis as unknown as { __karvonBounded?: Map<string, Map<string, Slot>> };
const bounded = () => (g2.__karvonBounded ??= new Map<string, Map<string, Slot>>());

export function boundedMemo<T>(name: string, maxEntries: number, ttlMs: number, key: string, load: () => Promise<T>): Promise<T> {
  let store = bounded().get(name);
  if (!store) bounded().set(name, (store = new Map()));
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  store.delete(key);
  while (store.size >= maxEntries) store.delete(store.keys().next().value as string); // Map keeps insertion order: oldest first
  const value = load();
  const slot: Slot = { at: Date.now(), value };
  store.set(key, slot);
  value.catch(() => { if (store!.get(key) === slot) store!.delete(key); });
  return value;
}

export function clearMemos() {
  slots().clear();
  for (const store of bounded().values()) store.clear();
}
