import { z } from "zod";
import { db } from "@/server/db";
import { serviceApi } from "@/server/http";
import { audit } from "@/server/security";
import { parseAd } from "@/server/ingestion/textparse";
import { ingestSingleListing } from "@/server/ingestion/pipeline";
import { invalidateMarketCache } from "@/server/services/market";
import type { SourceDescriptor } from "@/server/ingestion/types";

/**
 * Receives freight ads read from Telegram groups by the local listener script
 * (scripts/telegram-listener/, run on the operator's own machine with their own account —
 * group admins gave written/verbal consent to read, not to republish contact info).
 *
 * One FreightSource per group (id `tg-<username>`), so admin sees each group's health, and a
 * duplicate across groups merges into one offer with "N sources" like any other dedup case.
 * Authenticated with a shared secret (TELEGRAM_INGEST_SECRET), not a user session — the
 * caller is a script, not a browser.
 */

const schema = z.object({
  groupUsername: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_]+$/, "Not a valid public @username"),
  groupName: z.string().trim().min(1).max(200),
  // .nullish() because CSV rows without a known member count send JSON null, not a missing key.
  groupMembers: z.number().int().min(0).nullish(),
  messageId: z.number().int().positive(),
  text: z.string().trim().min(8).max(4000),
  // Loose on purpose: Python's datetime.isoformat() emits "+00:00" offsets, which zod's
  // strict .datetime() rejects unless told to expect one — just confirm Date can parse it.
  postedAt: z
    .string()
    .trim()
    .min(10)
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), "Not a parseable date")
    .optional(),
});

function sourceFor(username: string, name: string, members?: number | null): SourceDescriptor {
  return {
    id: `tg-${username.toLowerCase()}`,
    name: `Telegram: ${name}`,
    kind: "FEED",
    isDemo: false,
    homepage: `https://t.me/${username}`,
    accessNotes: `Public Telegram group${members ? ` (~${members.toLocaleString("en-US")} members)` : ""}. Read-only, by the admin's consent, via a dedicated Telethon listener on the operator's own account — no messages are ever sent. Group: @${username}.`,
  };
}

export const POST = serviceApi(
  "TELEGRAM_INGEST_SECRET",
  async ({ req }) => {
    const b = schema.parse(await req.json());
    const now = new Date();
    const source = sourceFor(b.groupUsername, b.groupName, b.groupMembers);

    // A group's first-ever poll backfills its recent history (see the listener's
    // BACKFILL_MESSAGES) — those messages can be days or weeks old by the time we read them.
    // Ad text routinely says things like "завтра" or a bare "21.07" with no year, and both must
    // be resolved against *when the message was actually posted*, not *when our server happened
    // to read it* — otherwise a backfilled message that said "tomorrow" on the day it was
    // posted gets parsed as "tomorrow from today", and a bare day.month that's already passed
    // this year gets its ambiguous-year heuristic bumped a full year into the future (confirmed
    // in production: dozens of backfilled July posts were parsed as loading in July *2027*).
    const referenceTime = b.postedAt ? new Date(b.postedAt) : now;
    const ad = parseAd(b.text, 0, String(b.messageId), referenceTime);
    if (!ad.listing) {
      // Still register/refresh the source so "0 matched, N skipped" shows up as real activity,
      // not silence, in the admin panel — but there is nothing to ingest.
      return { ok: true, matched: false, problems: ad.problems };
    }

    ad.listing.sourceUrl = `https://t.me/${b.groupUsername}/${b.messageId}`;
    ad.listing.broker = ad.listing.broker ?? b.groupName;
    if (b.postedAt) ad.listing.postedAt = b.postedAt;

    const r = await ingestSingleListing(db, source, ad.listing, now);
    if (!r.ok) return { ok: true, matched: false, problems: r.issues.map((i) => i.message) };

    invalidateMarketCache();
    await audit({ action: "telegram.ingest", entity: "FreightOffer", entityId: r.offerId, meta: { group: b.groupUsername, outcome: r.outcome } });
    return { ok: true, matched: true, offerId: r.offerId, outcome: r.outcome };
  },
  // High on purpose: this is secret-authenticated, not public, and a group's first-ever poll
  // backfills up to BACKFILL_MESSAGES ad-like messages in one go (no per-message delay on the
  // listener side) — with multiple listener instances sharing one IP that adds up fast. The
  // real throttle is upstream (the listener's own pacing + Telegram's own limits on reading).
  { limit: 1000 },
);

/** The listener also uses this to know which groups it's allowed to join/listen to. */
export const GET = serviceApi("TELEGRAM_INGEST_SECRET", async () => {
  const enabled = await db.freightSource.findMany({ where: { id: { startsWith: "tg-" } }, select: { id: true } });
  return { knownSources: enabled.map((s) => s.id) };
});
