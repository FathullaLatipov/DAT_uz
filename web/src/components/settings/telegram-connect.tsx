"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { Button } from "../ui/primitives";

/**
 * Settings card body: connect the Telegram bot to this account. The button opens the bot with a
 * one-time link; once the user taps Start there, the webhook links the chat and this page notices
 * (it polls for a couple of minutes) and flips to "Connected".
 */
export function TelegramConnect({ configured, linked }: { configured: boolean; linked: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting || linked) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      const r = await apiCall<{ linked: boolean }>("/api/telegram/link", "GET").catch(() => null);
      if (r?.linked) {
        setWaiting(false);
        router.refresh();
      } else if (tries >= 60) setWaiting(false);
    }, 3000);
    return () => clearInterval(id);
  }, [waiting, linked, router]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiCall<{ url: string }>("/api/telegram/link", "POST");
      setUrl(r.url);
      setWaiting(true);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    await apiCall("/api/telegram/link", "DELETE").catch(() => {});
    setBusy(false);
    setUrl(null);
    router.refresh();
  }

  if (!configured) return <p className="mt-2 text-muted">{t("st.tgNot")}</p>;
  if (linked)
    return (
      <div className="mt-3 space-y-2">
        <p className="flex items-center gap-1.5 font-medium text-pos"><Check className="h-4 w-4" /> {t("st.tgConnected")}</p>
        <p className="text-xs text-muted">{t("st.tgHow")}</p>
        <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>{t("st.tgDisconnect")}</Button>
      </div>
    );
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={connect} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("st.tgConnect")}
        </Button>
        {waiting && url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">{t("st.tgReopen")}</a>
        )}
      </div>
      {waiting && <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3 w-3 animate-spin" /> {t("st.tgWaiting")}</p>}
      {error && <p role="alert" className="text-xs text-neg">{error}</p>}
    </div>
  );
}
