import { z } from "zod";
import { api } from "@/server/http";
import { sendMessage } from "@/server/services/chat";

const schema = z.object({ body: z.string().max(5000) });

export const POST = api<{ id: string }>(async ({ req, session, params }) => {
  const { body } = schema.parse(await req.json());
  return sendMessage(session, params.id, body);
}, { limit: 40 });
