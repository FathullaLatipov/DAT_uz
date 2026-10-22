import { z } from "zod";
import { api } from "@/server/http";
import { startThread } from "@/server/services/chat";

const schema = z.object({ offerId: z.string().min(1).max(64) });

/** Opens (or returns) the conversation about a load with the company that posted it. */
export const POST = api(async ({ req, session }) => {
  const { offerId } = schema.parse(await req.json());
  return { id: await startThread(session.orgId, offerId) };
}, { limit: 30 });
