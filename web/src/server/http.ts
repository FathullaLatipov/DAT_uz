import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSession, type Session } from "./auth/session";
import { can, type Action } from "./auth/permissions";
import { rateLimit } from "./security";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const ip = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

type Ctx<P> = { req: NextRequest; session: Session; params: P; ip: string };

/**
 * Wraps an authenticated API route: session check, permission check, rate limit,
 * and user-friendly error mapping (no stack traces or internals leak to clients).
 */
export function api<P = Record<string, string>>(
  handler: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { action?: Action; limit?: number } = {},
) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, "Please sign in to continue.");
      if (opts.action && !can(session, opts.action)) throw new HttpError(403, "Your role doesn't allow this action.");
      const rl = rateLimit(`${session.userId}:${req.nextUrl.pathname}:${req.method}`, opts.limit ?? 120, 60_000);
      if (!rl.ok) {
        return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
      }
      const data = await handler({ req, session, params: await params, ip: ip(req) });
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/**
 * Wraps a machine-to-machine API route (no browser session): a local script or worker
 * authenticates with a shared secret instead of a cookie. Same rate limiting and error
 * mapping as `api()`. The secret is compared with a constant-time check.
 */
export function serviceApi<P = Record<string, string>>(
  envVar: string,
  handler: (ctx: { req: NextRequest; params: P; ip: string }) => Promise<unknown>,
  opts: { limit?: number } = {},
) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      const expected = process.env[envVar];
      if (!expected) throw new HttpError(503, "This endpoint is not configured.");
      const given = req.headers.get("x-ingest-secret") ?? "";
      if (!timingSafeEqualStr(given, expected)) throw new HttpError(401, "Invalid or missing secret.");
      const key = ip(req);
      const rl = rateLimit(`service:${envVar}:${key}`, opts.limit ?? 60, 60_000);
      if (!rl.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
      const data = await handler({ req, params: await params, ip: key });
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "The request was malformed. Please try again." }, { status: 400 });
  if (e instanceof ZodError)
    return NextResponse.json({ error: "Some fields are invalid.", fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
}

export { ip as clientIp };
