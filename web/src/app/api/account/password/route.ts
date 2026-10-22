import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { startSession } from "@/server/auth/session";
import { audit } from "@/server/security";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/password";

const schema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD),
  newPassword: z.string().min(MIN_PASSWORD, "Use at least 8 characters").max(MAX_PASSWORD),
});

/** The signed-in person changes their own password: the current one is required. Other sessions are signed out, this one stays. */
export const PATCH = api(
  async ({ req, session, ip }) => {
    const { currentPassword, newPassword } = schema.parse(await req.json());
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, "Your current password is incorrect.");
    if (currentPassword === newPassword) throw new HttpError(400, "Choose a new password different from the current one.");
    await db.user.update({ where: { id: session.userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() } });
    await startSession({ uid: session.userId, oid: session.orgId, role: session.role, prole: session.platformRole });
    await audit({ userId: session.userId, orgId: session.orgId, action: "account.password_changed", ip });
    return { ok: true };
  },
  { limit: 5 },
);
