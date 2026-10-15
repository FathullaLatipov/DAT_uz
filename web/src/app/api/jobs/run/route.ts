import { z } from "zod";
import { serviceApi } from "@/server/http";
import { JOB_NAMES } from "@/server/jobs/definitions";
import { runJob } from "@/server/jobs/runner";

/**
 * Runs one background job now. Called by the in-process scheduler (instrumentation.ts), and usable
 * from any external cron / by hand:
 *   curl -X POST $URL/api/jobs/run -H "x-ingest-secret: $JOBS_SECRET" -H "content-type: application/json" -d '{"job":"sync-sources"}'
 */
export const POST = serviceApi(
  "JOBS_SECRET",
  async ({ req }) => {
    const { job } = z.object({ job: z.enum(JOB_NAMES) }).parse(await req.json());
    return runJob(job);
  },
  { limit: 120 },
);
