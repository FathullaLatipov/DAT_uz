import { db } from "../db";

/**
 * Tells the platform operators something needs attention: an in-app notification for every
 * platform admin, plus a Telegram message when TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID are
 * set (the chat can be the operator's own DM with the bot, or a group). Never throws — an alert
 * that fails must not take down the job that raised it.
 */
export async function notifyAdmins(m: { title: string; body: string; link?: string }) {
  console.warn(`[alert] ${m.title} — ${m.body}`);
  try {
    const admins = await db.user.findMany({ where: { platformRole: "ADMIN" }, select: { id: true } });
    if (admins.length) {
      await db.notification.createMany({
        data: admins.map((a) => ({ userId: a.id, type: "SYSTEM", title: m.title, body: m.body, link: m.link ?? "/app/admin" })),
      });
    }
  } catch (e) {
    console.error("[alert] could not write in-app notification", e);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.ALERT_TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `${m.title}\n${m.body}`, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[alert] Telegram answered", res.status);
  } catch (e) {
    console.error("[alert] could not reach Telegram", e);
  }
}
