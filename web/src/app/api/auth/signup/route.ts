import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { startSession } from "@/server/auth/session";
import { audit, rateLimit } from "@/server/security";
import { clientIp, errorResponse } from "@/server/http";
import { ACCOUNT_TYPES, ROLE_FOR } from "@/server/domain/enums";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  company: z.string().trim().max(120).optional(),
  // Picked on the signup screen itself (truck owner vs broker); refined further in onboarding.
  accountType: z.enum(ACCOUNT_TYPES).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`signup:${ip}`, 5, 60_000).ok) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });

    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();
    if (await db.user.findUnique({ where: { email } })) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

    const user = await db.user.create({ data: { email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) } });
    const org = await db.organization.create({ data: { name: body.company || `${body.name}'s fleet`, plan: "FREE" } });
    // Account type picked on the signup screen (truck owner vs broker); further refined in onboarding.
    const accountType = body.accountType ?? "OWNER_OPERATOR";
    const role = ROLE_FOR[accountType];
    await db.membership.create({ data: { userId: user.id, orgId: org.id, role, accountType } });
    await db.orgPreference.create({ data: { orgId: org.id } });
    await startSession({ uid: user.id, oid: org.id, role, prole: "USER" });
    await audit({ userId: user.id, orgId: org.id, action: "auth.signup", meta: { accountType }, ip });
    return NextResponse.json({ ok: true, next: `/onboarding?type=${accountType}` });
  } catch (e) {
    return errorResponse(e);
  }
}
