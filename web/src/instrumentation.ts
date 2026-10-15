export async function register() {
  // Node server only (not the edge runtime), and never while `next build` is collecting pages.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOBS_ENABLED !== "1") return;
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}
