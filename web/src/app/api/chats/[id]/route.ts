import { api } from "@/server/http";
import { readThread } from "@/server/services/chat";

/** The conversation's messages; `?after=<iso time>` returns only newer ones (the chat polls with it). */
export const GET = api<{ id: string }>(async ({ req, session, params }) => {
  const raw = req.nextUrl.searchParams.get("after");
  const after = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  return readThread(session.orgId, params.id, after);
}, { limit: 240 });
