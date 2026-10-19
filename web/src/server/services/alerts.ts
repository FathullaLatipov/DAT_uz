import { db, parseJson } from "../db";
import { searchLoads } from "./freight";
import { loadFiltersSchema } from "./filters";
import { emailConfigured, sendEmail } from "./email";
import { i18nFor, sendTelegram, siteUrl, telegramConfigured } from "./telegram";

/**
 * Saved-search alerts. A check finds offers that appeared since the last check and match
 * the saved filters, then fans out to the configured channels.
 */

export interface AlertMessage {
  userId: string;
  title: string;
  body: string;
  link: string;
  /** Extra detail lines (Telegram shows them under the title). */
  lines?: string[];
  /** Set when the user linked a Telegram chat. */
  telegramChatId?: string | null;
  /** The person's e-mail, when they allow e-mail alerts. */
  email?: string | null;
  footer?: string;
  buttonText?: string;
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

/** Telegram: delivers to the chat the user linked in Settings (see services/telegram.ts). */
const telegramNotifier: Notifier = {
  channel: "TELEGRAM",
  configured: () => telegramConfigured(),
  async send(m) {
    if (!m.telegramChatId) return;
    await sendTelegram(m.telegramChatId, { title: m.title, lines: m.lines, button: { text: m.buttonText ?? "Open", url: `${siteUrl()}${m.link}` } });
  },
};

/** E-mail: the same alert, to the address on the account (when SMTP is configured and the person has not turned e-mail alerts off). */
const emailNotifier: Notifier = {
  channel: "EMAIL",
  configured: () => emailConfigured(),
  async send(m) {
    if (!m.email) return;
    await sendEmail({ to: m.email, subject: m.title, text: [m.body, ...(m.lines ?? [])].join("\n"), button: { text: m.buttonText ?? "Open", url: `${siteUrl()}${m.link}` }, footer: m.footer });
  },
};

const NOTIFIERS = [webNotifier, telegramNotifier, emailNotifier];
/** `telegramLinked`: whether this user has linked a chat; Telegram counts as configured for them only then. */
export const notifierStatus = (opts?: { telegramLinked?: boolean }) =>
  NOTIFIERS.map((n) => ({ channel: n.channel, configured: n.configured() && (n.channel !== "TELEGRAM" || (opts?.telegramLinked ?? true)) }));

/**
 * Scheduler entry point: checks every user's saved searches, not just the one who happens to open
 * the dashboard. Bails out in one cheap count when nothing new has arrived since the oldest check,
 * so a quiet period costs a single query instead of a full ranking pass per saved search.
 */
export async function checkAllSavedSearches(maxUsers = 200) {
  const searches = await db.savedSearch.findMany({ select: { userId: true, orgId: true, lastCheckedAt: true } });
  if (!searches.length) return { users: 0, alerts: 0, skipped: "no saved searches" };
  const oldest = new Date(Math.min(...searches.map((s) => s.lastCheckedAt.getTime())));
  const anyNew = await db.freightOffer.count({
    where: { status: "ACTIVE", OR: [{ sourceCreatedAt: { gt: oldest } }, { createdAt: { gt: oldest } }] },
  });
  if (!anyNew) return { users: 0, alerts: 0, skipped: "nothing new since the oldest check" };

  const pairs = [...new Map(searches.map((s) => [`${s.userId}:${s.orgId}`, s])).values()].slice(0, maxUsers);
  let alerts = 0;
  let failed = 0;
  for (const p of pairs) {
    try {
      alerts += await checkSavedSearches(p.userId, p.orgId);
    } catch (e) {
      failed++;
      console.error("[alerts]", p.userId, e);
    }
  }
  // One broken account is logged and skipped; every account failing means the job itself is broken
  // and must show up as FAILED (health-check alerts on two in a row), not as a quiet "ok".
  if (failed === pairs.length) throw new Error(`Saved-search check failed for all ${failed} account(s) — see the server log`);
  return { users: pairs.length, alerts, failed };
}

export async function checkSavedSearches(userId: string, orgId: string) {
  const searches = await db.savedSearch.findMany({ where: { userId, orgId } });
  // Alerts are written in the language the user last signed in with, not the server's.
  const user = await db.user.findUnique({ where: { id: userId }, select: { locale: true, telegramChatId: true, email: true, emailAlerts: true } });
  const i = i18nFor(user?.locale);
  let alerts = 0;
  for (const s of searches) {
    const parsed = loadFiltersSchema.safeParse(parseJson(s.filters, {}));
    if (!parsed.success) continue;
    const res = await searchLoads(orgId, userId, parsed.data, 1, 200);
    const fresh = res.rows.filter((r) => (r.offer.sourceCreatedAt ?? r.offer.createdAt) > s.lastCheckedAt);
    if (fresh.length) {
      const best = fresh[0];
      const line = (r: (typeof fresh)[number], key: "alerts.top" | "alerts.line") =>
        i.t(key, {
          route: `${i.city(r.offer.originCityId)} → ${i.city(r.offer.destCityId)}`,
          rate: r.offer.rateUsd > 0 ? i.usd(r.offer.rateUsd) : i.t("table.negotiable"),
          match: r.match?.eligible ? i.t("alerts.matchPct", { n: r.match.score }) : "",
        });
      const top = fresh.slice(0, 3);
      const msg: AlertMessage = {
        userId,
        title: i.tn("alerts.title", fresh.length, { name: s.name }),
        body: line(best, "alerts.top"),
        lines: [...top.map((r) => line(r, "alerts.line")), ...(fresh.length > top.length ? [i.tn("alerts.more", fresh.length - top.length)] : [])],
        link: `/app/loads/${best.offer.id}`,
        telegramChatId: user?.telegramChatId,
        email: user?.emailAlerts ? user.email : null,
        footer: i.t("email.footer"),
        buttonText: i.t("alerts.open"),
      };
      const channels = parseJson<string[]>(s.channels, ["WEB"]);
      for (const n of NOTIFIERS) if (channels.includes(n.channel) && n.configured()) await n.send(msg);
      alerts++;
    }
    await db.savedSearch.update({ where: { id: s.id }, data: { lastCheckedAt: new Date() } });
  }
  return alerts;
}
