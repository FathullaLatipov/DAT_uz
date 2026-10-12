import { SignJWT, jwtVerify } from "jose";

/** Edge-safe session token helpers (used by middleware and server code). */

export const SESSION_COOKIE = "karvon_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 7;

export interface SessionClaims {
  uid: string;
  oid: string;
  role: string; // org role
  prole: string; // platform role
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (≥32 chars) in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0000");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(c: SessionClaims) {
  return new SignJWT({ ...c })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.oid !== "string") return null;
    return { uid: payload.uid, oid: payload.oid, role: String(payload.role), prole: String(payload.prole) };
  } catch {
    return null;
  }
}
