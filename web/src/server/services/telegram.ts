import { db } from "../db";
import { createI18n } from "../../i18n/create";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/config";
import { MESSAGES } from "../../i18n/messages";

/**
 * Telegram bot for per-user alerts.
 *
 * Linking: the signed-in user asks for a one-time link (`createLinkUrl`) → opens
 * https://t.me/<bot>?start=<token> → taps Start → Telegram posts the update to our webhook →
 * `handleUpdate` binds that chat to the user. After that, saved-search alerts can be delivered there.
 *
 * Needs TELEGRAM_BOT_TOKEN (from @BotFather) and APP_URL (public https address of the site) for the webhook.
 * The webhook is authenticated by Telegram's secret-token header; the secret is derived from the bot
 * token, so there is nothing more to configure.
 */

// Overridable so tests can point the bot at a local stand-in instead of the real Telegram.
const api = () => process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";
const LINK_TTL_MS = 15 * 60_000;

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Web Crypto, like the rest of the app (this module is reachable from the instrumentation bundle). */
export async function webhookSecret(): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`karvon-telegram-webhook:${token}`))).slice(0, 48);
}

// APP_URL is read at run time (NEXT_PUBLIC_* values are fixed when the image is built).
export const siteUrl = () => (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/** Telegram only accepts https webhooks and url buttons that point somewhere reachable. */
const isPublicHttps = (u: string) => u.startsWith("https://");

export const i18nFor = (locale: string | null | undefined) => {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return createI18n(l, MESSAGES[l]);
};

/** Escapes text for Telegram's HTML parse mode. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; result?: T; description?: string; retryAfter?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const res = await fetch(`${api()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
    return { ok: !!j.ok, status: res.status, result: j.result, description: j.description, retryAfter: j.parameters?.retry_after };
  } catch (e) {
    return { ok: false, status: 0, description: e instanceof Error ? e.message : "network error" };
  }
}

export interface OutgoingMessage {
  /** Plain text lines; escaped here. The first line is shown in bold. */
  title: string;
  lines?: string[];
  button?: { text: string; url: string };
}

/**
 * Sends one message. A chat that blocked the bot (403) is unlinked so we stop trying.
 * Never throws — an alert that cannot be delivered must not break the job that raised it.
 */
export async function sendTelegram(chatId: string, m: OutgoingMessage): Promise<boolean> {
  const text = [`<b>${esc(m.title)}</b>`, ...(m.lines ?? []).map(esc)].join("\n");
  const r = await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(m.button && isPublicHttps(m.button.url) ? { reply_markup: { inline_keyboard: [[{ text: m.button.text, url: m.button.url }]] } } : {}),
  });
  if (r.ok) return true;
  if (r.status === 403) {
    await db.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null, telegramLinkedAt: null } }).catch(() => {});
  } else if (r.status === 429) {
    console.warn(`[telegram] rate limited, retry after ${r.retryAfter ?? "?"}s`);
  } else {
    console.error("[telegram] sendMessage failed", r.status, r.description);
  }
  return false;
}

let botName: string | undefined;
async function botUsername(): Promise<string | null> {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
  if (botName) return botName;
  const r = await call<{ username?: string }>("getMe", {});
  botName = r.result?.username;
  return botName ?? null;
}

let webhookReady = false;
/** Points the bot at our webhook (idempotent). Needs a public https site URL; returns whether it is set. */
export async function ensureWebhook(): Promise<boolean> {
  if (webhookReady) return true;
  const secret = await webhookSecret();
  const url = `${siteUrl()}/api/telegram/webhook`;
  if (!secret || !isPublicHttps(url)) return false;
  const r = await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false });
  if (!r.ok) console.error("[telegram] setWebhook failed", r.description);
  webhookReady = r.ok;
  return r.ok;
}

/** Creates a one-time link for the signed-in user. */
export async function createLinkUrl(userId: string, locale: string | undefined): Promise<{ url: string } | { error: "not-configured" | "no-bot" }> {
  if (!telegramConfigured()) return { error: "not-configured" };
  const name = await botUsername();
  if (!name) return { error: "no-bot" };
  await ensureWebhook();
  await db.telegramLink.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  const token = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
  await db.telegramLink.create({ data: { token, userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) } });
  if (isLocale(locale)) await db.user.update({ where: { id: userId }, data: { locale } }).catch(() => {});
  return { url: `https://t.me/${name}?start=${token}` };
}

export async function unlinkUser(userId: string) {
  await db.user.update({ where: { id: userId }, data: { telegramChatId: null, telegramLinkedAt: null } });
  await db.telegramLink.deleteMany({ where: { userId } });
}

interface Update {
  message?: { chat?: { id?: number; type?: string }; text?: string; from?: { language_code?: string } };
}

/** Handles one webhook update: /start <token> links, /stop unlinks, anything else gets a short help text. */
export async function handleUpdate(u: Update) {
  const msg = u.message;
  const chat = msg?.chat;
  if (!msg?.text || !chat?.id || chat.type !== "private") return; // alerts are personal: private chats only
  const chatId = String(chat.id);
  const text = msg.text.trim();
  const user = await db.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true, locale: true } });
  const speak = (locale?: string | null) => i18nFor(locale ?? msg.from?.language_code?.slice(0, 2));

  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (start) {
    const token = start[1];
    if (!token) {
      const i = speak(user?.locale);
      await sendTelegram(chatId, { title: i.t("tg.welcomeTitle"), lines: [i.t(user ? "tg.alreadyLinked" : "tg.howToLink")] });
      return;
    }
    const link = await db.telegramLink.findUnique({ where: { token } });
    if (!link || link.expiresAt < new Date()) {
      await sendTelegram(chatId, { title: speak(user?.locale).t("tg.linkExpired") });
      return;
    }
    // One chat belongs to one account: moving it to this user detaches it from any other.
    await db.$transaction([
      db.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: link.userId } }, data: { telegramChatId: null, telegramLinkedAt: null } }),
      db.user.update({ where: { id: link.userId }, data: { telegramChatId: chatId, telegramLinkedAt: new Date() } }),
      db.telegramLink.delete({ where: { token } }),
    ]);
    const linked = await db.user.findUnique({ where: { id: link.userId }, select: { name: true, locale: true } });
    const i = speak(linked?.locale);
    await sendTelegram(chatId, { title: i.t("tg.linkedTitle"), lines: [i.t("tg.linkedBody", { name: linked?.name ?? "" })], button: { text: i.t("tg.openSaved"), url: `${siteUrl()}/app/saved` } });
    return;
  }

  const i = speak(user?.locale);
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    if (user) await unlinkUser(user.id);
    await sendTelegram(chatId, { title: i.t("tg.unlinked") });
    return;
  }
  await sendTelegram(chatId, { title: i.t("tg.welcomeTitle"), lines: [i.t(user ? "tg.help" : "tg.howToLink")] });
}
