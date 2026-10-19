export async function register() {
  // Node server only. The import sits inside a plain `=== "nodejs"` block so the edge build of this file drops
  // it entirely: the scheduler pulls in Node-only code (database client, SMTP) that cannot be bundled for the edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Never while `next build` is collecting pages, and only where the scheduler is switched on.
    if (process.env.NEXT_PHASE === "phase-production-build" || process.env.JOBS_ENABLED !== "1") return;
    const { startScheduler } = await import("./server/jobs/scheduler");
    startScheduler();
  }
}
