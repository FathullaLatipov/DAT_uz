import { db, parseJson } from "../db";
import { liveAdapters } from "../ingestion/registry";
import { expireStaleOffers, mergeReposts, runIngestion } from "../ingestion/pipeline";
import { checkAllSavedSearches } from "../services/alerts";
import { rateAgeHours, refreshRatesFromCbu } from "../services/fx";
import { invalidateMarketCache } from "../services/market";
import { DEFAULT_LIMITS, diffIssues, evaluateHealth, type HealthFacts } from "./health";
import { notifyAdmins } from "./notify";

export interface JobDef {
  everyMin: number;
  /** Wait this long after boot before the first run, so jobs don't all hit the DB while the app warms up. */
  startDelayS: number;
  run: () => Promise<Record<string, unknown>>;
}

const bust = () => {
  try {
    invalidateMarketCache();
  } catch {
    /* only works inside a request context; the market cache expires by itself within a minute */
  }
};

export const JOBS = {
  "sync-sources": {
    everyMin: 15,
    startDelayS: 45,
    async run() {
      const adapters = liveAdapters();
      if (!adapters.length) return { note: "no live source is switched on (set DIIP_SYNC=on)" };
      const sources = [];
      for (const a of adapters) {
        const s = await runIngestion(db, a);
        sources.push({ id: s.sourceId, status: s.status, fetched: s.fetched, created: s.created, updated: s.updated, duplicates: s.duplicates, rejected: s.rejected, errors: s.errors });
      }
      bust();
      return { sources };
    },
  },
  "expire-offers": {
    everyMin: 10,
    startDelayS: 60,
    async run() {
      // Ingestion only expires offers as a side effect of a source sync, so push-fed sources
      // (Telegram, user posts) would otherwise keep showing loads long past their date.
      const expired = await expireStaleOffers(db);
      if (expired) bust();
      return { expired };
    },
  },
  "merge-reposts": {
    everyMin: 60,
    startDelayS: 240,
    async run() {
      // Backstop for the ingest-time repost check: the same ad posted again and again becomes one offer.
      const r = await mergeReposts(db);
      if (r.merged) bust();
      return r;
    },
  },
  "saved-search-alerts": {
    everyMin: 10,
    startDelayS: 90,
    run: () => checkAllSavedSearches(),
  },
  "refresh-fx": {
    everyMin: 6 * 60,
    startDelayS: 20,
    async run() {
      return { ...(await refreshRatesFromCbu(db)) };
    },
  },
  "health-check": {
    everyMin: 10,
    startDelayS: 150,
    run: healthCheck,
  },
} satisfies Record<string, JobDef>;

export type JobName = keyof typeof JOBS;
export const JOB_NAMES = Object.keys(JOBS) as [JobName, ...JobName[]];

async function healthCheck() {
  const now = new Date();
  const live = liveAdapters();
  const [sources, tg, recentRealOffers, anyReal, fxAgeHours, previous] = await Promise.all([
    db.freightSource.findMany({ where: { id: { in: live.map((a) => a.descriptor.id) } } }),
    db.freightSource.findMany({ where: { id: { startsWith: "tg-" }, lastSyncAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, select: { id: true, lastSyncAt: true } }),
    db.freightOffer.count({ where: { isDemo: false, createdAt: { gte: new Date(now.getTime() - DEFAULT_LIMITS.offerWindowH * 3_600_000) } } }),
    db.freightOffer.findFirst({ where: { isDemo: false }, select: { id: true } }),
    rateAgeHours(db),
    db.jobRun.findFirst({ where: { job: "health-check", status: "SUCCESS" }, orderBy: { startedAt: "desc" }, select: { result: true } }),
  ]);

  const lastRuns = await Promise.all(sources.map((s) => db.ingestionRun.findFirst({ where: { sourceId: s.id }, orderBy: { startedAt: "desc" }, select: { status: true, fetched: true } })));
  const jobRuns: HealthFacts["jobRuns"] = {};
  await Promise.all(
    (Object.keys(JOBS) as JobName[]).map(async (name) => {
      jobRuns[name] = await db.jobRun.findMany({ where: { job: name }, orderBy: { startedAt: "desc" }, take: 3, select: { status: true, startedAt: true } });
    }),
  );

  const issues = evaluateHealth({
    now,
    scheduledSources: sources.map((s, i) => ({ id: s.id, name: s.name, status: s.status, lastSuccessAt: s.lastSuccessAt, lastRunStatus: lastRuns[i]?.status ?? null, lastRunFetched: lastRuns[i]?.fetched ?? null })),
    telegramSources: tg,
    recentRealOffers,
    anyRealOffersEver: !!anyReal,
    fxAgeHours,
    jobRuns,
    jobIntervalsMin: Object.fromEntries(Object.entries(JOBS).map(([k, v]) => [k, v.everyMin])),
  });

  const { appeared, resolved } = diffIssues(parseJson<{ issues?: string[] }>(previous?.result, {}).issues ?? [], issues);
  for (const i of appeared) await notifyAdmins({ title: `⚠️ ${i.title}`, body: i.detail });
  if (resolved.length) await notifyAdmins({ title: "✅ Recovered", body: resolved.join(", ") });

  // Housekeeping: the run history only needs to cover recent days.
  const pruned = await db.jobRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });

  return { issues: issues.map((i) => i.key), appeared: appeared.length, resolved: resolved.length, pruned: pruned.count };
}
