"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";

/** Settings: e-mail copies of important notifications, on or off. */
export function EmailAlerts({ initial, email, available }: { initial: boolean; email: string; available: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setOn(next);
    setSaved(false);
    setError(null);
    try {
      await apiCall("/api/account", "PATCH", { emailAlerts: next });
      setSaved(true);
    } catch (e) {
      setOn(!next);
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info"><Mail className="h-4 w-4" /></div>
      <div className="min-w-0">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          {t("st.emailTitle")}
        </label>
        <p className="mt-1.5 text-muted">{t("st.emailBody", { email })}</p>
        {!available && <p className="mt-1.5 text-xs text-warn">{t("st.emailOff")}</p>}
        {saved && <p role="status" className="mt-1.5 text-xs text-pos">{t("st.emailSaved")}</p>}
        {error && <p role="alert" className="mt-1.5 text-xs text-neg">{error}</p>}
      </div>
    </div>
  );
}
