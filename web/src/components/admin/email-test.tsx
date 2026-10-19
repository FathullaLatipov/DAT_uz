"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { Button } from "../ui/primitives";

/** Admin health card: send a real test message to the admin's own address. */
export function EmailTest({ configured }: { configured: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await apiCall<{ to: string }>("/api/admin/email-test", "POST");
      setResult({ ok: true, text: t("adm.testSent", { email: r.to }) });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="outline" onClick={send} disabled={busy || !configured}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} {t("adm.testSend")}
      </Button>
      {result && <p role="status" className={result.ok ? "text-xs text-pos" : "text-xs text-neg"}>{result.text}</p>}
    </div>
  );
}
