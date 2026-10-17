import type { PrismaClient } from "@prisma/client";
import { CITIES, COUNTRIES } from "../domain/geo";
import { normalizeListing, qualityLevel } from "./normalize";
import { findDuplicate, findRepost, fingerprint, phoneKey, textKey, type DedupCandidate, type RepostCandidate } from "./dedupe";
import { loadRates } from "../services/fx";
import type { FreightSourceAdapter, NormalizedOffer, ParsedListing, QualityIssue, SourceDescriptor } from "./types";

export interface IngestionStats {
  sourceId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  rejected: number;
  errors: number;
  durationMs: number;
}

const DAY = 86_400_000;

let geoSynced = false;
/** Cities and countries live in code (domain/geo.ts); make sure every one exists in the DB. */
export async function ensureGeo(db: PrismaClient) {
  if (geoSynced) return;
  for (const c of COUNTRIES) await db.country.upsert({ where: { code: c.code }, create: { code: c.code, name: c.name }, update: {} });
  for (const c of CITIES)
    await db.city.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, countryCode: c.country, lat: c.lat, lng: c.lng, aliases: JSON.stringify(c.aliases), isHub: !!c.hub },
      update: {},
    });
  geoSynced = true;
}

/**
 * Source adapter → normalization → quality checks → dedup → FreightOffer / FreightListing.
 * Every step is recorded on an IngestionRun so the admin panel can show per-source health.
 */
export async function runIngestion(db: PrismaClient, adapter: FreightSourceAdapter, now = new Date()): Promise<IngestionStats> {
  const d = adapter.descriptor;
  await ensureGeo(db);
  await loadRates(db);
  const started = Date.now();
  const stats: IngestionStats = {
    sourceId: d.id, status: "SUCCESS", fetched: 0, created: 0, updated: 0, duplicates: 0, rejected: 0, errors: 0, durationMs: 0,
  };

  await db.freightSource.upsert({
    where: { id: d.id },
    create: { id: d.id, name: d.name, kind: d.kind, isDemo: d.isDemo, homepage: d.homepage, accessNotes: d.accessNotes,
      status: adapter.isConfigured() ? "ACTIVE" : "NOT_CONFIGURED" },
    update: { name: d.name, kind: d.kind, homepage: d.homepage, accessNotes: d.accessNotes,
      status: adapter.isConfigured() ? "ACTIVE" : "NOT_CONFIGURED" },
  });

  if (!adapter.isConfigured()) return { ...stats, status: "SKIPPED" };

  const run = await db.ingestionRun.create({ data: { sourceId: d.id, status: "RUNNING", startedAt: now } });
  const errorLog: { externalId: string; message: string }[] = [];

  try {
    const listings = await adapter.fetch();
    stats.fetched = listings.length;

    for (const l of listings) {
      try {
        const { offer, issues } = normalizeListing(l, now);
        if (!offer) {
          stats.rejected++;
          errorLog.push({ externalId: l.externalId, message: issues.map((i) => i.message).join("; ") });
          continue;
        }
        const outcome = await upsertListing(db, d.id, d.isDemo, offer, issues, l.raw, now);
        stats[outcome]++;
      } catch (e) {
        stats.errors++;
        errorLog.push({ externalId: l.externalId, message: (e as Error).message });
      }
    }
    if (stats.errors > 0) stats.status = "PARTIAL";
  } catch (e) {
    stats.status = "FAILED";
    stats.errors++;
    errorLog.push({ externalId: "*", message: (e as Error).message });
  }

  stats.durationMs = Date.now() - started;
  await db.ingestionRun.update({
    where: { id: run.id },
    data: { ...pick(stats), status: stats.status, finishedAt: new Date(), durationMs: stats.durationMs, errorLog: JSON.stringify(errorLog.slice(0, 200)) },
  });
  await db.freightSource.update({
    where: { id: d.id },
    data: {
      lastSyncAt: new Date(),
      ...(stats.status !== "FAILED" ? { lastSuccessAt: new Date(), status: "ACTIVE" } : { status: "ERROR" }),
    },
  });
  await expireStaleOffers(db, now);
  return stats;
}

const pick = (s: IngestionStats) => ({
  fetched: s.fetched, created: s.created, updated: s.updated, duplicates: s.duplicates, rejected: s.rejected, errors: s.errors,
});

/** The ad text a listing was parsed from (Telegram and pasted ads keep it as `raw.text`). */
export function rawText(rawPayload: string): string | null {
  try {
    const t = (JSON.parse(rawPayload) as { text?: unknown } | null)?.text;
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

async function resolveBroker(db: PrismaClient, o: NormalizedOffer, isDemo: boolean) {
  if (!o.brokerKey || !o.brokerName) return null;
  const existing = await db.broker.findUnique({ where: { normalizedName: o.brokerKey } });
  if (existing) return existing;
  return db.broker.create({ data: { name: o.brokerName, normalizedName: o.brokerKey, isDemo } });
}

async function upsertListing(
  db: PrismaClient,
  sourceId: string,
  isDemo: boolean,
  o: NormalizedOffer,
  issues: QualityIssue[],
  raw: unknown,
  now: Date,
): Promise<"created" | "updated" | "duplicates"> {
  const listingData = {
    rate: o.rate ?? 0,
    currency: o.currency ?? "USD",
    rateUsd: o.rateUsd ?? 0,
    sourceUrl: o.sourceUrl,
    brokerNameRaw: o.brokerName,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    rawPayload: JSON.stringify(raw),
    sourceCreatedAt: o.postedAt,
    lastSeenAt: now,
  };

  // 1. Same source + same external id → refresh.
  const existing = await db.freightListing.findUnique({ where: { sourceId_externalId: { sourceId, externalId: o.externalId } } });
  if (existing) {
    await db.freightListing.update({ where: { id: existing.id }, data: listingData });
    await refreshOffer(db, existing.offerId, now);
    return "updated";
  }

  // 1b. A repost: the same phone or the same text on the same lane, day, weight and body — from this
  // source or any other. It joins the offer it repeats instead of becoming a second row.
  const phone = phoneKey(o.contactPhone);
  const text = textKey((raw as { text?: string } | null)?.text);
  if (phone || text) {
    // Kept light on purpose (this runs for every incoming ad): only phone numbers are pulled for the
    // lane/day, and the text is compared inside the database as an exact match on the stored payload —
    // loading every listing's payload for a busy lane cost far too much memory.
    const lane = {
      originCityId: o.originCityId,
      destCityId: o.destCityId,
      loadingDate: { gte: new Date(o.loadingDate.getTime() - DAY / 2), lte: new Date(o.loadingDate.getTime() + DAY / 2) },
      isDemo,
      status: "ACTIVE",
    };
    const sameDay = await db.freightOffer.findMany({
      where: lane,
      select: { id: true, weightKg: true, bodyType: true, listings: { select: { contactPhone: true } } },
      take: 1500,
    });
    const sameText = text ? new Set((await db.freightListing.findMany({ where: { rawPayload: JSON.stringify(raw), offer: lane }, select: { offerId: true }, take: 50 })).map((l) => l.offerId)) : new Set<string>();
    const cands: RepostCandidate[] = sameDay.map((c) => ({
      id: c.id,
      weightKg: c.weightKg,
      bodyType: c.bodyType,
      listings: [
        ...c.listings.map((l) => ({ phone: phoneKey(l.contactPhone), text: null as string | null })),
        ...(sameText.has(c.id) ? [{ phone: null as string | null, text }] : []),
      ],
    }));
    const repostOf = findRepost({ weightKg: o.weightKg, bodyType: o.bodyType, phone, text }, cands);
    if (repostOf) {
      await db.freightListing.create({ data: { ...listingData, offerId: repostOf, sourceId, externalId: o.externalId, firstSeenAt: now } });
      await refreshOffer(db, repostOf, now);
      return "duplicates";
    }
  }

  const broker = await resolveBroker(db, o, isDemo);
  let fp = fingerprint(o);

  // 2. Exact fingerprint, or 3. fuzzy match on the same lane within ±1 day.
  // Cross-source duplicates only: one source never lists the same load twice under different
  // ids, so an offer that already carries a listing from THIS source is a different load.
  const exact = await db.freightOffer.findUnique({
    where: { fingerprint: fp },
    select: { id: true, isDemo: true, listings: { where: { sourceId }, select: { id: true }, take: 1 } },
  });
  // Real and demo data never merge, and neither do two listings from the same source.
  const mergeable = !!exact && exact.listings.length === 0 && exact.isDemo === isDemo;
  let offerId = mergeable ? exact!.id : undefined;
  if (exact && !mergeable) fp = `${fp}|${sourceId}:${o.externalId}`; // keep fingerprints unique
  if (!offerId) {
    const lane = await db.freightOffer.findMany({
      where: {
        originCityId: o.originCityId,
        destCityId: o.destCityId,
        loadingDate: { gte: new Date(o.loadingDate.getTime() - DAY - 1), lte: new Date(o.loadingDate.getTime() + DAY + 1) },
        isDemo,
        NOT: { listings: { some: { sourceId } } },
      },
      include: { broker: { select: { normalizedName: true } } },
    });
    const candidates: DedupCandidate[] = lane.map((c) => ({ ...c, brokerKey: c.broker?.normalizedName ?? null }));
    offerId = findDuplicate(o, candidates)?.id;
  }

  if (offerId) {
    await db.freightListing.create({ data: { ...listingData, offerId, sourceId, externalId: o.externalId, firstSeenAt: now } });
    await refreshOffer(db, offerId, now);
    return "duplicates";
  }

  const created = await db.freightOffer.create({
    data: {
      fingerprint: fp,
      originCityId: o.originCityId,
      destCityId: o.destCityId,
      originCountry: o.originCountry,
      destCountry: o.destCountry,
      loadingDate: o.loadingDate,
      unloadingDate: o.unloadingDate,
      cargoType: o.cargoType,
      weightKg: o.weightKg,
      volumeM3: o.volumeM3,
      bodyType: o.bodyType,
      truckType: o.truckType,
      packaging: o.packaging,
      requirements: JSON.stringify(o.requirements),
      distanceKm: o.distanceKm,
      rate: o.rate ?? 0,
      currency: o.currency ?? "USD",
      rateUsd: o.rateUsd ?? 0,
      paymentTerms: o.paymentTerms,
      brokerId: broker?.id,
      status: o.expiresAt < now ? "EXPIRED" : "ACTIVE",
      quality: qualityLevel(issues, { brokerVerified: broker?.verified }),
      qualityFlags: JSON.stringify(issues.map((i) => i.code)),
      isDemo,
      sourceCreatedAt: o.postedAt,
      lastSeenAt: now,
      expiresAt: o.expiresAt,
      createdAt: o.postedAt ?? now,
      listings: { create: { ...listingData, sourceId, externalId: o.externalId, firstSeenAt: now } },
    },
  });
  void created;
  return "created";
}

/** Re-derive best rate, freshness and quality from all listings of an offer. */
export async function refreshOffer(db: PrismaClient, offerId: string, now: Date) {
  const offer = await db.freightOffer.findUnique({ where: { id: offerId }, include: { listings: true, broker: true } });
  if (!offer) return;
  // Best source for a carrier = highest published rate.
  const best = offer.listings.filter((l) => l.rateUsd > 0).sort((a, b) => b.rateUsd - a.rateUsd)[0];
  const flags = JSON.parse(offer.qualityFlags) as string[];
  const issues = flags.map((code) => ({ code, severity: "WARN" as const, message: code }));
  await db.freightOffer.update({
    where: { id: offerId },
    data: {
      lastSeenAt: now,
      ...(best ? { rate: best.rate, currency: best.currency, rateUsd: best.rateUsd } : {}),
      quality: qualityLevel(issues, { brokerVerified: offer.broker?.verified, sourceCount: new Set(offer.listings.map((l) => l.sourceId)).size }),
    },
  });
}

export async function expireStaleOffers(db: PrismaClient, now = new Date()) {
  const r = await db.freightOffer.updateMany({ where: { status: "ACTIVE", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}

export const PLATFORM_SOURCE = {
  id: "karvon",
  name: "Karvon (posted on platform)",
  kind: "PLATFORM",
  isDemo: false,
  accessNotes: "Loads posted directly on Karvon by registered shippers and brokers. First-party data.",
} as const;

/**
 * Ingest a single listing against an arbitrary source — same normalization, quality checks
 * and dedup as a batch adapter, but for one listing at a time (platform posts, pasted ads,
 * a Telegram group's new message). Registers/refreshes the FreightSource on every call so a
 * source with many single-listing calls still shows up with a fresh `lastSyncAt` in the admin
 * panel. Returns the offer id, or the rejection reasons.
 */
export async function ingestSingleListing(db: PrismaClient, source: SourceDescriptor, listing: ParsedListing, now = new Date()) {
  await ensureGeo(db);
  await loadRates(db);
  await db.freightSource.upsert({
    where: { id: source.id },
    create: { id: source.id, name: source.name, kind: source.kind, isDemo: source.isDemo, homepage: source.homepage, accessNotes: source.accessNotes, status: "ACTIVE", lastSyncAt: now, lastSuccessAt: now },
    update: { name: source.name, homepage: source.homepage, accessNotes: source.accessNotes, lastSyncAt: now, lastSuccessAt: now, status: "ACTIVE" },
  });
  const { offer, issues } = normalizeListing(listing, now);
  if (!offer) return { ok: false as const, issues };
  const outcome = await upsertListing(db, source.id, source.isDemo, offer, issues, listing.raw, now);
  const l = await db.freightListing.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: offer.externalId } }, select: { offerId: true } });
  return { ok: true as const, offerId: l!.offerId, outcome, issues };
}

/** Back-compat wrapper: ingest against the fixed first-party PLATFORM_SOURCE. */
export async function ingestPlatformListing(db: PrismaClient, listing: ParsedListing, now = new Date()) {
  return ingestSingleListing(db, PLATFORM_SOURCE, listing, now);
}

/**
 * Folds reposts that are already in the database into one offer: same lane, day, weight and body,
 * and the same phone or text. The oldest posting stays; the rest hand over their listings (so the
 * kept offer shows every source) and are expired. Safe to run repeatedly — it is the backstop for
 * anything the ingest-time check missed (older rows, or a repost that arrived before its twin).
 */
export async function mergeReposts(db: PrismaClient, opts: { sinceDays?: number; now?: Date; maxGroups?: number; budgetMs?: number } = {}) {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 120_000;
  // Work one lane-and-day at a time, biggest first: only that group's offers are in memory, never the whole
  // table (an earlier version loaded every active offer with its payloads and ran the server out of memory).
  const groups = await db.$queryRaw<{ o: string; d: string; day: string }[]>`
    SELECT "originCityId" AS o, "destCityId" AS d, to_char("loadingDate", 'YYYY-MM-DD') AS day
    FROM "FreightOffer"
    WHERE status = 'ACTIVE' AND "isDemo" = false AND "createdAt" >= ${new Date(now.getTime() - (opts.sinceDays ?? 14) * DAY)}
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT ${opts.maxGroups ?? 300}`;
  let merged = 0;
  let scanned = 0;
  let groupsDone = 0;
  const touched = new Set<string>();
  for (const g of groups) {
    if (Date.now() - started > budgetMs) break;
    groupsDone++;
    await new Promise((r) => setTimeout(r, 20)); // leave room for the site itself on a one-CPU container
    const offers = await db.freightOffer.findMany({
      where: {
        originCityId: g.o, destCityId: g.d, status: "ACTIVE", isDemo: false,
        loadingDate: { gte: new Date(`${g.day}T00:00:00Z`), lt: new Date(new Date(`${g.day}T00:00:00Z`).getTime() + DAY) },
      },
      select: { id: true, weightKg: true, bodyType: true, listings: { select: { contactPhone: true, rawPayload: true } } },
      orderBy: { createdAt: "asc" },
      take: 1500,
    });
    scanned += offers.length;
    const keepers: RepostCandidate[] = [];
    for (const o of offers) {
      const sigs = o.listings.map((l) => ({ phone: phoneKey(l.contactPhone), text: textKey(rawText(l.rawPayload)) }));
      let keeperId: string | null = null;
      for (const sig of sigs) {
        keeperId = findRepost({ weightKg: o.weightKg, bodyType: o.bodyType, ...sig }, keepers);
        if (keeperId) break;
      }
      if (!keeperId) {
        keepers.push({ id: o.id, weightKg: o.weightKg, bodyType: o.bodyType, listings: sigs });
        continue;
      }
      await db.freightListing.updateMany({ where: { offerId: o.id }, data: { offerId: keeperId } });
      const favs = await db.favorite.findMany({ where: { offerId: o.id }, select: { id: true } });
      for (const f of favs) await db.favorite.update({ where: { id: f.id }, data: { offerId: keeperId } }).catch(() => {}); // the user already saved the kept one
      await db.freightOffer.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
      keepers.find((k) => k.id === keeperId)!.listings.push(...sigs);
      touched.add(keeperId);
      merged++;
    }
  }
  for (const id of touched) await refreshOffer(db, id, now);
  return { groups: groups.length, groupsDone, scanned, merged, keptOffersUpdated: touched.size };
}
