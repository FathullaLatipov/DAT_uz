import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";
import { dispatch } from "@/server/ai/dispatcher";

const schema = z.object({ message: z.string().trim().min(1).max(500), conversationId: z.string().max(64).optional() });

export const POST = api(
  async ({ req, session }) => {
    const { message, conversationId } = schema.parse(await req.json());
    let conv = conversationId ? await db.aIConversation.findFirst({ where: { id: conversationId, userId: session.userId } }) : null;
    conv ??= await db.aIConversation.create({ data: { userId: session.userId, orgId: session.orgId, title: message.slice(0, 60) } });

    await db.aIMessage.create({ data: { conversationId: conv.id, role: "user", content: message } });
    const reply = await dispatch(session.orgId, session.userId, message);
    const { text, ...data } = reply;
    const saved = await db.aIMessage.create({ data: { conversationId: conv.id, role: "assistant", content: text, data: JSON.stringify(data) } });
    return { conversationId: conv.id, message: { id: saved.id, role: "assistant", content: text, data } };
  },
  { limit: 20 },
);

export const DELETE = api(async ({ session }) => {
  await db.aIConversation.deleteMany({ where: { userId: session.userId } });
  return { ok: true };
});
