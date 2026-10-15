import { JOBS, type JobName } from "./definitions";

/**
 * In-process scheduler, started from instrumentation.ts when JOBS_ENABLED=1.
 *
 * Each tick does not run the job directly: it POSTs to this server's own /api/jobs/run. That keeps
 * the job inside a normal request context (Next's data cache and revalidateTag only work there)
 * and means the exact same code path serves an external cron (curl/GitHub Actions) if you ever
 * move off a single long-lived container.
 */
export function startScheduler() {
  const g = globalThis as { __karvonScheduler?: boolean };
  if (g.__karvonScheduler) return; // dev hot reload / double register()
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    console.warn("[jobs] JOBS_ENABLED=1 but JOBS_SECRET is not set — scheduler not started.");
    return;
  }
  g.__karvonScheduler = true;
  const base = process.env.JOBS_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;

  const trigger = async (name: JobName) => {
    try {
      const res = await fetch(`${base}/api/jobs/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
        body: JSON.stringify({ job: name }),
        signal: AbortSignal.timeout(20 * 60_000),
      });
      if (!res.ok) console.error(`[jobs] ${name}: server answered ${res.status}`);
    } catch (e) {
      console.error(`[jobs] ${name}: could not reach ${base}`, (e as Error).message);
    }
  };

  for (const [name, def] of Object.entries(JOBS) as [JobName, (typeof JOBS)[JobName]][]) {
    // setTimeout chain, not setInterval: the next run is scheduled only after this one returned.
    const loop = async () => {
      await trigger(name);
      setTimeout(loop, def.everyMin * 60_000).unref();
    };
    setTimeout(loop, def.startDelayS * 1000).unref();
  }
  console.log(`[jobs] scheduler started: ${Object.entries(JOBS).map(([n, d]) => `${n}/${d.everyMin}m`).join(", ")}`);
}
