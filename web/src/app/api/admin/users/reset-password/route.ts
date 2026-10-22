import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { startSession } from "@/server/auth/session";
import { audit } from "@/server/security";
import { generateTempPassword } from "@/lib/password";
import { notifyUser, RECIPIENT_SELECT } from "@/server/services/notify-user";

const schema = z.object({ email: z.string().trim().email().max(200) });

/**
 * Platform admin: gives a person a new temporary password (shown once, to the admin) and signs them out everywhere.
 * The person is told in the app (and by e-mail/Telegram where set up) that an administrator did this, and is asked to
 * change the password after signing in. The password itself is never stored in the log.
 */
export const POST = api(
  async ({ req, session, ip }) => {
    const { email } = schema.parse(await req.json());
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { ...RECIPIENT_SELECT, name: true } });
    if (!user) throw new HttpError(404, "No user with this e-mail.");
    const temporaryPassword = generateTempPassword();
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 10), passwordChangedAt: new Date() } });
    // An admin resetting their own password keeps their own session.
    if (user.id === session.userId) await startSession({ uid: session.userId, oid: session.orgId, role: session.role, prole: session.platformRole });
    await audit({ userId: session.userId, orgId: session.orgId, action: "admin.password_reset", entity: "User", entityId: user.id, meta: { email: user.email }, ip });
    await notifyUser(user, (i) => ({ title: i.t("pw.resetTitle"), body: i.t("pw.resetBody"), link: "/app/settings?tab=security", button: i.t("pw.resetButton") })).catch((e) => console.error("[password-reset] notify failed", e));
    return { ok: true, email: user.email, name: user.name, temporaryPassword };
  },
  { action: "platform:admin", limit: 20 },
);
