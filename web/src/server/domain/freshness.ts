import type { Prisma } from "@prisma/client";
import { STALE_AFTER_MS } from "../../lib/format";

/** Id of the first-party source loads posted on Karvon belong to (kept in step with `PLATFORM_SOURCE.id` by a test). */
export const PLATFORM_SOURCE_ID = "karvon";

/**
 * A load nobody has seen for `STALE_AFTER_MS` is probably gone: taken, or pulled from the feed or the Telegram group.
 * Showing it wastes the carrier's call, so lists leave it out. What counts as "seen": a source (a feed sync, a repost,
 * a Telegram message) confirmed it within that time. Not subject to this: loads posted on Karvon (the poster closes
 * them, and the booking is atomic) and demo data.
 */
export const freshOfferFilter = (now = new Date()): Prisma.FreightOfferWhereInput => ({
  OR: [
    { lastSeenAt: { gte: new Date(now.getTime() - STALE_AFTER_MS) } },
    { isDemo: true },
    { listings: { some: { sourceId: PLATFORM_SOURCE_ID } } },
  ],
});
