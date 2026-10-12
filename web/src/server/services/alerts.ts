import { db, parseJson } from "../db";
import { getCity } from "../domain/geo";
import { searchLoads } from "./freight";
import { loadFiltersSchema } from "./filters";

/**
 * Saved-search alerts. A check finds offers that appeared since the last check and match
 * the saved filters, then fans out to the configured channels.
 */

export interface AlertMessage {
  userId: string;
  title: string;
  body: string;
  link: string;
}

export interface Notifier {
  channel: "WEB" | "EMAIL" | "TELEGRAM";
  configured(): boolean;
  send(m: AlertMessage): Promise<void>;
}

const webNotifier: Notifier = {
  channel: "WEB",
  configured: () => true,
  async send(m) {
    await db.notification.create({ data: { userId: m.userId, type: "SAVED_SEARCH", title: m.title, body: m.body, link: m.link } });
  },
};

/**
 * Telegram: requires TELEGRAM_BOT_TOKEN and a per-user chat id (linking flow via /start <code>
 * is designed but not shipped in the MVP). Until then, it reports not configured and is skipped.
 */
const telegramNotifier: Notifier = {
  channel: "TELEGRAM",
  configured: () => !!process.env.TELEGRAM_BOT_TOKEN,
  async send() {
    // Implementation sketch: POST https://api.telegram.org/bot<TOKEN>/sendMessage
    // { chat_id, text, reply_markup: { inline_keyboard: [[{ text: "View load", url }]] } }
  },
};

const emailNotifier: Notifier = {
  channel: "EMAIL",
  configured: () => !!process.env.SMTP_URL,
  async send() {
    // Wire to an SMTP/transactional provider when configured.
  },
};

const NOTIFIERS = [webNotifier, telegramNotifier, emailNotifier];
export const notifierStatus = () => NOTIFIERS.map((n) => ({ channel: n.channel, configured: n.configured() }));

export async function checkSavedSearches(userId: string, orgId: string) {
  const searches = await db.savedSearch.findMany({ where: { userId, orgId } });
  let alerts = 0;
  for (const s of searches) {
    const parsed = loadFiltersSchema.safeParse(parseJson(s.filters, {}));
    if (!parsed.success) continue;
    const res = await searchLoads(orgId, userId, parsed.data, 1, 200);
    const fresh = res.rows.filter((r) => (r.offer.sourceCreatedAt ?? r.offer.createdAt) > s.lastCheckedAt);
    if (fresh.length) {
      const best = fresh[0];
      const route = `${getCity(best.offer.originCityId)?.name} → ${getCity(best.offer.destCityId)?.name}`;
      const msg: AlertMessage = {
        userId,
        title: `${fresh.length} new load${fresh.length > 1 ? "s" : ""} for “${s.name}”`,
        body: `Top: ${route}, $${Math.round(best.offer.rateUsd).toLocaleString("en-US")}${best.match?.eligible ? ` · ${best.match.score}% match` : ""}`,
        link: `/app/loads/${best.offer.id}`,
      };
      const channels = parseJson<string[]>(s.channels, ["WEB"]);
      for (const n of NOTIFIERS) if (channels.includes(n.channel) && n.configured()) await n.send(msg);
      alerts++;
    }
    await db.savedSearch.update({ where: { id: s.id }, data: { lastCheckedAt: new Date() } });
  }
  return alerts;
}
