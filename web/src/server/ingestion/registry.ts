import type { PrismaClient } from "@prisma/client";
import { demoExchangeA, demoExchangeB } from "./adapters/demo";
import { diipAdapter } from "./adapters/diip";
import { externalAdapters } from "./adapters/external";
import { runIngestion } from "./pipeline";
import { jobsEnabled } from "../jobs/config";
import type { FreightSourceAdapter } from "./types";

/** All scheduled sources. Manual CSV import runs on demand from the admin panel. */
export function scheduledAdapters(): FreightSourceAdapter[] {
  const demoEnabled = process.env.DEMO_SOURCES !== "off";
  return [...(demoEnabled ? [demoExchangeA, demoExchangeB] : []), diipAdapter, ...externalAdapters];
}

export async function syncAllSources(db: PrismaClient) {
  const results = [];
  for (const a of scheduledAdapters()) results.push(await runIngestion(db, a));
  return results;
}

/** Real (non-demo) sources that are switched on — what the scheduler keeps fresh. */
export const liveAdapters = () => scheduledAdapters().filter((a) => !a.descriptor.isDemo && a.isConfigured());

let lastAuto = 0;
let running = false;
/**
 * Fallback for deployments with no scheduler (JOBS_ENABLED unset, e.g. Vercel): when a public page
 * is requested and the last sync is older than `maxAgeMin`, a sync starts in the background.
 * Guarded against overlap. With the scheduler on this does nothing — the `sync-sources` job owns it.
 */
export function autoSyncIfStale(db: PrismaClient, maxAgeMin = 15) {
  if (jobsEnabled() || running || Date.now() - lastAuto < maxAgeMin * 60_000) return;
  lastAuto = Date.now();
  running = true;
  const live = liveAdapters();
  void (async () => {
    try {
      for (const a of live) await runIngestion(db, a);
    } catch (e) {
      console.error("[auto-sync]", e);
    } finally {
      running = false;
    }
  })();
}
