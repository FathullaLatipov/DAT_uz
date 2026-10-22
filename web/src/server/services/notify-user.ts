import { db } from "../db";
import { sendEmail } from "./email";
import { i18nFor, sendTelegram, siteUrl } from "./telegram";

export interface Recipient {
  id: string;
  email: string;
  locale: string | null;
  telegramChatId: string | null;
  emailAlerts: boolean;
}

/** The user fields `notifyUser` needs; select these wherever a recipient is looked up. */
export const RECIPIENT_SELECT = { id: true, email: true, locale: true, telegramChatId: true, emailAlerts: true } as const;

/**
 * One event, every channel the person has: the in-app notification always, Telegram if they linked it, and
 * e-mail if the server can send it and they have not turned e-mail alerts off — all in their own language.
 * `build` receives that language's translator and returns the texts.
 */
export async function notifyUser(
  user: Recipient,
  build: (i: ReturnType<typeof i18nFor>) => { title: string; body: string; link: string; button: string },
) {
  const i = i18nFor(user.locale);
  const m = build(i);
  await db.notification.create({ data: { userId: user.id, type: "SYSTEM", title: m.title, body: m.body, link: m.link } });
  const url = `${siteUrl()}${m.link}`;
  if (user.telegramChatId) await sendTelegram(user.telegramChatId, { title: m.title, lines: [m.body], button: { text: m.button, url } });
  if (user.emailAlerts) await sendEmail({ to: user.email, subject: m.title, text: m.body, button: { text: m.button, url }, footer: i.t("email.footer") });
}

/** The same event for every member of a company, each in their own language and on every channel they use. */
export async function notifyOrg(orgId: string, build: Parameters<typeof notifyUser>[1]) {
  const members = await db.membership.findMany({ where: { orgId }, select: { user: { select: RECIPIENT_SELECT } } });
  for (const { user } of members) await notifyUser(user, build);
}
