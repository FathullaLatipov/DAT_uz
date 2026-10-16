import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { db, parseJson } from "@/server/db";
import { getProvider } from "@/server/ai/provider";
import { Chat, type ChatMessage } from "@/components/assistant/chat";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.aiDispatcher") };
}

export default async function AssistantPage() {
  const s = await requireSession();
  const conv = await db.aIConversation.findFirst({
    where: { userId: s.userId },
    orderBy: { createdAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
  });
  const initial: ChatMessage[] = (conv?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.content,
    data: parseJson(m.data, null),
  }));
  return (
    <div className="mx-auto max-w-4xl">
      <Chat initial={initial} conversationId={conv?.id ?? null} provider={getProvider().name} />
    </div>
  );
}
