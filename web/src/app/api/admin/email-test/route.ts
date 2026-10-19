import { api, HttpError } from "@/server/http";
import { i18nFor, siteUrl } from "@/server/services/telegram";
import { emailConfigured, sendEmail } from "@/server/services/email";
import { db } from "@/server/db";

/** Platform admin: send a test message to the admin's own address, to check the SMTP settings end to end. */
export const POST = api(
  async ({ session }) => {
    if (!emailConfigured()) throw new HttpError(409, "E-mail is not set up on this server.");
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true, locale: true } });
    if (!user) throw new HttpError(404, "User not found.");
    const i = i18nFor(user.locale);
    const ok = await sendEmail({
      to: user.email,
      subject: i.t("emailTest.subject"),
      text: i.t("emailTest.body"),
      button: { text: i.t("emailTest.button"), url: siteUrl() },
      footer: i.t("email.footer"),
    });
    if (!ok) throw new HttpError(502, "The mail server did not accept the message. See the server log.");
    return { ok: true, to: user.email };
  },
  { action: "platform:admin", limit: 10 },
);
