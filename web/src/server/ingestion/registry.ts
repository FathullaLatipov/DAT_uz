import type { PrismaClient } from "@prisma/client";
import { demoExchangeA, demoExchangeB } from "./adapters/demo";
import { diipAdapter } from "./adapters/diip";
import { externalAdapters } from "./adapters/external";
import { runIngestion } from "./pipeline";
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

let lastAuto = 0;
let running = false;
/**
 * Keeps real sources fresh without a scheduler: when a public page is requested and the last
 * sync is older than `maxAgeMin`, a sync starts in the background. Guarded against overlap.
 */
export function autoSyncIfStale(db: PrismaClient, maxAgeMin = 15) {
  if (running || Date.now() - lastAuto < maxAgeMin * 60_000) return;
  lastAuto = Date.now();
  running = true;
  const live = scheduledAdapters().filter((a) => !a.descriptor.isDemo && a.isConfigured());
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
