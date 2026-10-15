import { db } from "../db";
import { JOBS, type JobName } from "./definitions";

/** A RUNNING row older than this belongs to a process that died or hung; it no longer blocks the job. */
const STALE_RUNNING_MS = 30 * 60_000;

export type JobOutcome =
  | { skipped: true; reason: string }
  | { skipped?: false; ok: true; durationMs: number; result: Record<string, unknown> }
  | { skipped?: false; ok: false; durationMs: number; error: string };

/**
 * Runs one job and records it in JobRun. The RUNNING row doubles as a lock, so a slow sync can't
 * overlap itself, and it works across processes (a second instance, or a manual run from the admin).
 * Never throws: failures are recorded and returned.
 */
export async function runJob(name: JobName): Promise<JobOutcome> {
  const now = new Date();
  await db.jobRun.updateMany({
    where: { job: name, status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
    data: { status: "FAILED", finishedAt: now, error: "Interrupted — the process stopped or the job hung." },
  });
  if (await db.jobRun.findFirst({ where: { job: name, status: "RUNNING" }, select: { id: true } })) {
    return { skipped: true, reason: "already running" };
  }

  const run = await db.jobRun.create({ data: { job: name, status: "RUNNING" } });
  const t0 = Date.now();
  try {
    const result = await JOBS[name].run();
    const durationMs = Date.now() - t0;
    await db.jobRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), durationMs, result: JSON.stringify(result) } });
    return { ok: true, durationMs, result };
  } catch (e) {
    const durationMs = Date.now() - t0;
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[job:${name}]`, e);
    await db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), durationMs, error: error.slice(0, 1000) } }).catch(() => {});
    return { ok: false, durationMs, error };
  }
}
