/**
 * Pure health evaluation: facts about the platform in, list of problems out. Kept free of
 * database access so the rules can be unit-tested; jobs/definitions.ts gathers the facts.
 */

export interface Issue {
  /** Stable identity: the same problem keeps the same key between runs, which is how we alert only on change. */
  key: string;
  title: string;
  detail: string;
}

export interface HealthFacts {
  now: Date;
  /** Real (non-demo) sources the scheduler syncs by itself. */
  scheduledSources: { id: string; name: string; status: string; lastSuccessAt: Date | null; lastRunStatus: string | null; lastRunFetched: number | null }[];
  /** Telegram group sources (`tg-*`) — they are push-fed by the listener, not synced by us. */
  telegramSources: { id: string; lastSyncAt: Date | null }[];
  /** Non-demo offers ingested in the last `offerWindowH` hours, and whether there ever were any. */
  recentRealOffers: number;
  anyRealOffersEver: boolean;
  fxAgeHours: number | null;
  /** Latest runs per job, newest first. */
  jobRuns: Record<string, { status: string; startedAt: Date }[]>;
  /** How often each job should run, in minutes. */
  jobIntervalsMin: Record<string, number>;
}

export interface HealthLimits {
  sourceStaleMin: number;
  telegramSilentMin: number;
  offerWindowH: number;
  fxMaxAgeH: number;
}

export const DEFAULT_LIMITS: HealthLimits = {
  sourceStaleMin: 90,
  telegramSilentMin: 120,
  offerWindowH: 6,
  fxMaxAgeH: 72,
};

const minutes = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000);

export function evaluateHealth(f: HealthFacts, limits: HealthLimits = DEFAULT_LIMITS): Issue[] {
  const issues: Issue[] = [];

  for (const s of f.scheduledSources) {
    if (s.status === "ERROR" || s.lastRunStatus === "FAILED") {
      issues.push({ key: `source-failed:${s.id}`, title: `${s.name}: last sync failed`, detail: "The most recent run ended in an error. See Admin → Ingestion runs." });
    } else if (!s.lastSuccessAt) {
      issues.push({ key: `source-never:${s.id}`, title: `${s.name}: never synced successfully`, detail: "The source is enabled but has no successful run yet." });
    } else if (minutes(f.now, s.lastSuccessAt) > limits.sourceStaleMin) {
      issues.push({ key: `source-stale:${s.id}`, title: `${s.name}: no successful sync for ${minutes(f.now, s.lastSuccessAt)} min`, detail: `Expected one at least every ${limits.sourceStaleMin} min.` });
    } else if (s.lastRunStatus === "SUCCESS" && s.lastRunFetched === 0) {
      issues.push({ key: `source-empty:${s.id}`, title: `${s.name}: last sync returned 0 loads`, detail: "The feed answered but was empty — the endpoint may have changed." });
    }
  }

  // The listener posts one message per ad it understands, so across ~300 groups silence means it is down.
  const tgSeen = f.telegramSources.map((s) => s.lastSyncAt).filter((d): d is Date => !!d);
  if (tgSeen.length) {
    const newest = new Date(Math.max(...tgSeen.map((d) => d.getTime())));
    const silent = minutes(f.now, newest);
    if (silent > limits.telegramSilentMin) {
      issues.push({ key: "telegram-silent", title: `Telegram listener silent for ${silent} min`, detail: `No ad from any of ${f.telegramSources.length} groups arrived. Check the listener machine (supervisor.log).` });
    }
  }

  if (f.anyRealOffersEver && f.recentRealOffers === 0) {
    issues.push({ key: "no-new-offers", title: `No new real loads in ${limits.offerWindowH} h`, detail: "Every source may be down, or the parser is rejecting everything." });
  }

  if (f.fxAgeHours == null) {
    issues.push({ key: "fx-never", title: "Exchange rates were never fetched from the Central Bank", detail: "Loads are being converted with built-in reference rates." });
  } else if (f.fxAgeHours > limits.fxMaxAgeH) {
    issues.push({ key: "fx-stale", title: `Exchange rates are ${Math.round(f.fxAgeHours / 24)} days old`, detail: "The daily refresh from cbu.uz is failing." });
  }

  for (const [job, runs] of Object.entries(f.jobRuns)) {
    const finished = runs.filter((r) => r.status !== "RUNNING");
    if (finished.length >= 2 && finished[0].status === "FAILED" && finished[1].status === "FAILED") {
      issues.push({ key: `job-failing:${job}`, title: `Job “${job}” failed twice in a row`, detail: "See Admin → Background jobs for the error." });
    }
    const every = f.jobIntervalsMin[job];
    if (every && job !== "health-check") {
      const last = runs[0]?.startedAt;
      if (last && minutes(f.now, last) > every * 3 + 5) {
        issues.push({ key: `job-late:${job}`, title: `Job “${job}” has not run for ${minutes(f.now, last)} min`, detail: `It should run every ${every} min.` });
      }
    }
  }

  return issues;
}

/** Which problems appeared and which went away since the previous check — alerts fire on change only. */
export function diffIssues(previousKeys: string[], current: Issue[]) {
  const prev = new Set(previousKeys);
  const now = new Set(current.map((i) => i.key));
  return {
    appeared: current.filter((i) => !prev.has(i.key)),
    resolved: previousKeys.filter((k) => !now.has(k)),
  };
}
