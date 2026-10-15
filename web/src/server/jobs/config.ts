/**
 * Background jobs run inside the Next server process (see instrumentation.ts) when
 * JOBS_ENABLED=1 — the Docker deployment. On hosts that can't keep a timer alive (Vercel
 * serverless) leave it off and call POST /api/jobs/run from an external cron instead.
 */
export const jobsEnabled = () => process.env.JOBS_ENABLED === "1";
