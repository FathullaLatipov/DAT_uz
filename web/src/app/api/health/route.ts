import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { jobsEnabled } from "@/server/jobs/config";

export const dynamic = "force-dynamic";

/**
 * Public liveness probe for an external uptime monitor (UptimeRobot, Better Stack, ...). It is the
 * watcher of the watcher: the scheduler alerts on a failing source, but cannot alert on its own
 * death, so a monitor polling this URL does. 503 when the DB is unreachable or — with the scheduler
 * on — no health check has completed in 30 minutes. Exposes no data beyond ok/age.
 */
export async function GET() {
  try {
    const last = await db.jobRun.findFirst({ where: { job: "health-check", status: "SUCCESS" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    const ageMin = last ? Math.round((Date.now() - last.startedAt.getTime()) / 60_000) : null;
    const scheduler = jobsEnabled();
    const ok = !scheduler || (ageMin != null && ageMin <= 30);
    return NextResponse.json({ ok, scheduler, lastHealthCheckMinAgo: ageMin }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
