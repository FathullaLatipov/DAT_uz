"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { Button } from "../ui/primitives";

/** "Write to {company}": opens (or creates) the chat about this load and goes to it. */
export function ChatButton({ offerId, peerName, threadId }: { offerId: string; peerName: string; threadId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    try {
      const id = threadId ?? (await apiCall<{ id: string }>("/api/chats", "POST", { offerId })).id;
      router.push(`/app/chats?t=${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div>
      <Button type="button" variant="outline" onClick={open} disabled={busy} className="w-full justify-center">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} {threadId ? t("chat.open") : t("chat.write", { name: peerName })}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-neg">{error}</p>}
    </div>
  );
}
