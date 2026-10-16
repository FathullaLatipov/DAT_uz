import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { getLocale } from "@/i18n/server";
import { createLinkUrl, unlinkUser } from "@/server/services/telegram";

/** Start linking: returns the t.me deep link the user opens to confirm in Telegram. */
export const POST = api(
  async ({ session }) => {
    const r = await createLinkUrl(session.userId, await getLocale());
    if ("error" in r) throw new HttpError(503, "The Telegram bot isn't set up on this server yet.");
    return r;
  },
  { limit: 10 },
);

/** Is this account linked yet? (polled while the user is in Telegram) */
export const GET = api(
  async ({ session }) => {
    const u = await db.user.findUnique({ where: { id: session.userId }, select: { telegramChatId: true } });
    return { linked: !!u?.telegramChatId };
  },
  { limit: 60 },
);

export const DELETE = api(
  async ({ session }) => {
    await unlinkUser(session.userId);
    return { ok: true };
  },
  { limit: 10 },
);
