import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { SESSION_COOKIE, SESSION_TTL_S, signSession, verifySession, type SessionClaims } from "./token";

export interface Session {
  userId: string;
  orgId: string;
  role: string;
  platformRole: string;
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; plan: string; isDemo: boolean };
}

/**
 * Resolves the session and re-checks membership in the DB on every request, so revoked
 * memberships take effect immediately (the JWT alone is never trusted for org access).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const m = await db.membership.findUnique({
    where: { userId_orgId: { userId: claims.uid, orgId: claims.oid } },
    include: { user: true, org: true },
  });
  if (!m) return null;
  return {
    userId: m.userId,
    orgId: m.orgId,
    role: m.role,
    platformRole: m.user.platformRole,
    user: { id: m.user.id, name: m.user.name, email: m.user.email },
    org: { id: m.org.id, name: m.org.name, plan: m.org.plan, isDemo: m.org.isDemo },
  };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function startSession(c: SessionClaims) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(c), {
    httpOnly: true,
    sameSite: "lax",
    // `next build && next start` always sets NODE_ENV=production, even for a local HTTP
    // deployment like this one — forcing `secure: true` there would mark the cookie
    // Secure-only, which a browser can refuse to store (or send back) over plain HTTP and
    // produce exactly the auth-never-sticks / redirect-loop symptom. Gate on an explicit
    // opt-in instead, set once the app is actually served over HTTPS.
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
