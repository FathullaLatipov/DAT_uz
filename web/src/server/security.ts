import { db } from "./db";

/**
 * In-memory fixed-window rate limiter. Good enough for a single instance; swap for Redis
 * (INCR + EXPIRE) when running more than one server.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return { ok: true, retryAfterS: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

export async function audit(entry: { userId?: string | null; orgId?: string | null; action: string; entity?: string; entityId?: string; meta?: unknown; ip?: string | null }) {
  try {
    await db.auditLog.create({
      data: { ...entry, meta: JSON.stringify(entry.meta ?? {}) },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
