import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "@/i18n/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { startSession } from "@/server/auth/session";
import { audit, rateLimit } from "@/server/security";
import { clientIp, errorResponse, localize } from "@/server/http";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: await localize("Too many sign-in attempts. Try again in a minute.") }, { status: 429 });

    const { email, password } = schema.parse(await req.json());
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } } });
    // Same message for unknown email and wrong password.
    if (!user || !(await bcrypt.compare(password, user.passwordHash)) || !user.memberships[0]) {
      await audit({ action: "auth.login_failed", meta: { email }, ip });
      return NextResponse.json({ error: await localize("Email or password is incorrect.") }, { status: 401 });
    }
    const m = user.memberships[0];
    await startSession({ uid: user.id, oid: m.orgId, role: m.role, prole: user.platformRole });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), locale: await getLocale() } });
    await audit({ userId: user.id, orgId: m.orgId, action: "auth.login", ip });
    const trucks = await db.truck.count({ where: { orgId: m.orgId } });
    return NextResponse.json({ ok: true, next: trucks ? "/app" : "/onboarding" });
  } catch (e) {
    return await errorResponse(e);
  }
}
