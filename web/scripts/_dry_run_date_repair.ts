/**
 * READ-ONLY dry run. Does not write to the database. For every ACTIVE, non-demo offer whose
 * listings are ALL from Telegram sources, re-parses the earliest listing's original ad text
 * (rawPayload) against its own real post time (sourceCreatedAt) using the FIXED parser, and
 * compares the result to what's actually stored on the offer. Reports candidates; changes
 * nothing.
 */
import { PrismaClient } from "@prisma/client";
import { parseAd } from "../src/server/ingestion/textparse";

const db = new PrismaClient();
const DAY = 86_400_000;

interface Row {
  id: string;
  originCityId: string;
  destCityId: string;
  loadingDate: Date;
  weightKg: number;
  bodyType: string;
}

async function main() {
  const offers = await db.freightOffer.findMany({
    where: { status: "ACTIVE", isDemo: false },
    select: {
      id: true, originCityId: true, destCityId: true, loadingDate: true, weightKg: true, bodyType: true,
      listings: { select: { sourceId: true, externalId: true, rawPayload: true, sourceCreatedAt: true, firstSeenAt: true } },
    },
  });

  let telegramOnly = 0, mixedOrOther = 0;
  let unchanged = 0, highConfidence = 0, ambiguous = 0, unrecoverable = 0;
  let yearJumpCount = 0, relativeLagCount = 0;
  const samples: { offerId: string; route: string; stored: string; corrected: string; postedAt: string; confidence: string }[] = [];
  const bySourceBucket: Record<string, number> = {};

  for (const o of offers as (Row & { listings: { sourceId: string; externalId: string; rawPayload: string; sourceCreatedAt: Date | null; firstSeenAt: Date }[] })[]) {
    const allTelegram = o.listings.length > 0 && o.listings.every((l) => l.sourceId.startsWith("tg-"));
    if (!allTelegram) { mixedOrOther++; continue; }
    telegramOnly++;

    // Earliest listing = closest to when the load was actually first posted.
    const earliest = [...o.listings].sort((a, b) => (a.sourceCreatedAt ?? a.firstSeenAt).getTime() - (b.sourceCreatedAt ?? b.firstSeenAt).getTime())[0];
    let text: string | undefined;
    try {
      text = (JSON.parse(earliest.rawPayload) as { text?: string }).text;
    } catch {
      text = undefined;
    }
    const postedAt = earliest.sourceCreatedAt ?? earliest.firstSeenAt;
    if (!text || !postedAt) {
      unrecoverable++;
      continue;
    }

    const reparsed = parseAd(text, 0, earliest.externalId, postedAt);
    if (!reparsed.listing || !reparsed.listing.loadingDate) {
      unrecoverable++;
      continue;
    }
    const corrected = new Date(reparsed.listing.loadingDate);
    const stored = o.loadingDate;
    const diffDays = Math.abs(corrected.getTime() - stored.getTime()) / DAY;

    if (diffDays < 1) {
      unchanged++;
      continue;
    }

    // Two distinct high-confidence signatures, both caused by the same root bug (resolving ad
    // text against ingestion time instead of the message's real post time) — classified
    // separately because they look different and are worth reporting as such:
    //
    // (a) "Year-jump": a bare day.month got its ambiguous-year heuristic bumped a whole year
    //     forward. Signature: the difference from stored is close to a whole number of years,
    //     AND the corrected date lands near the actual posting time (a real ad is for near-term
    //     pickup, generously ±100 days of when it was posted — not an arbitrary future booking).
    //
    // (b) "Relative-date lag": a word like "today"/"tomorrow" was resolved against the
    //     ingestion time, not the post time — this matters when ingestion lagged days behind
    //     the real post (a newly-added group's backfill reading messages from several days
    //     earlier). Signature: a small shift (under 10 days, almost always the corrected date
    //     being *earlier* than stored, since ingestion lags *after* posting) where the corrected
    //     date lands very close to the post time itself (within ~2 days) — exactly where a
    //     relative "today/tomorrow" word should land.
    const postedToCorrectedDays = (corrected.getTime() - postedAt.getTime()) / DAY;
    const nearPostingTime = Math.abs(postedToCorrectedDays) <= 100;
    const yearsDiff = diffDays / 365.25;
    const yearJump = Math.abs(yearsDiff - Math.round(yearsDiff)) < 0.02 && Math.round(yearsDiff) >= 1;
    const relativeDateLag = diffDays < 10 && Math.abs(postedToCorrectedDays) <= 2;

    const confidence = nearPostingTime && (yearJump || relativeDateLag) ? "HIGH" : "AMBIGUOUS";
    if (confidence === "HIGH") {
      highConfidence++;
      if (yearJump) yearJumpCount++;
      else relativeLagCount++;
    } else ambiguous++;

    const bucket = `${stored.getUTCFullYear()}`;
    bySourceBucket[bucket] = (bySourceBucket[bucket] ?? 0) + 1;

    if (samples.length < 25) {
      samples.push({
        offerId: o.id,
        route: `${o.originCityId}->${o.destCityId}`,
        stored: stored.toISOString().slice(0, 10),
        corrected: corrected.toISOString().slice(0, 10),
        postedAt: postedAt.toISOString().slice(0, 10),
        confidence,
      });
    }
  }

  console.log("=== DRY RUN — DATE REPAIR CANDIDATES (no writes performed) ===");
  console.log(`Total ACTIVE non-demo offers examined: ${offers.length}`);
  console.log(`  Telegram-only (in scope for this repair): ${telegramOnly}`);
  console.log(`  Mixed-source or non-Telegram (out of scope, left alone): ${mixedOrOther}`);
  console.log(`Within Telegram-only scope:`);
  console.log(`  Unchanged (re-parse matches stored date): ${unchanged}`);
  console.log(`  HIGH CONFIDENCE correction candidates: ${highConfidence} (year-jump signature: ${yearJumpCount}, relative-date-lag signature: ${relativeLagCount})`);
  console.log(`  AMBIGUOUS (differs, but doesn't match the clean bug signature — needs manual review): ${ambiguous}`);
  console.log(`  Unrecoverable (missing/unparseable original text or post time): ${unrecoverable}`);
  console.log(`\nStored-year distribution of candidates (unchanged excluded):`, bySourceBucket);
  console.log(`\nSample before/after (first ${samples.length}):`);
  for (const s of samples) console.log(`  [${s.confidence}] offer ${s.offerId} ${s.route}: stored=${s.stored} -> corrected=${s.corrected} (posted ${s.postedAt})`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
