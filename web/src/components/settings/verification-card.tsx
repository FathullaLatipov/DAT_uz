"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Clock, Loader2, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { Badge, Button, Field, Input } from "../ui/primitives";

export type VerificationState = "none" | "pending" | "approved" | "rejected";

/** Settings card where a company applies to be verified and sees the answer. */
export function VerificationCard({
  state, companyName, pendingSince, reason, canEdit,
}: { state: VerificationState; companyName: string; pendingSince: string | null; reason: string | null; canEdit: boolean }) {
  const { t, shortDate } = useI18n();
  const router = useRouter();
  const [v, setV] = useState({ companyName, taxId: "", phone: "", note: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiCall("/api/verification", "POST", { ...v, note: v.note || undefined });
      setSent(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const badge =
    state === "approved" ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> {t("ver.approved")}</Badge>
    : state === "pending" ? <Badge tone="warn"><Clock className="h-3 w-3" /> {t("ver.pending")}</Badge>
    : state === "rejected" ? <Badge tone="neg"><ShieldAlert className="h-3 w-3" /> {t("ver.rejected")}</Badge>
    : <Badge><ShieldQuestion className="h-3 w-3" /> {t("ver.none")}</Badge>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">{badge}</div>
      <p className="text-muted">{t("ver.subtitle")}</p>
      {state === "approved" && <p className="text-pos">{t("ver.approvedBody")}</p>}
      {state === "pending" && <p className="text-muted">{t("ver.pendingBody", { date: pendingSince ? shortDate(pendingSince) : "" })}</p>}
      {state === "rejected" && reason && <p className="rounded-lg bg-neg-soft px-3 py-2 text-neg">{t("ver.rejectedWhy", { reason })}</p>}
      {sent && state !== "pending" && <p className="text-pos">{t("ver.sent")}</p>}

      {(state === "none" || state === "rejected") && canEdit && (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ver.companyName")}><Input required minLength={2} value={v.companyName} onChange={set("companyName")} /></Field>
          <Field label={t("ver.taxId")}><Input required pattern="[0-9A-Za-z\-]{5,20}" inputMode="numeric" value={v.taxId} onChange={set("taxId")} /></Field>
          <Field label={t("ver.phone")}><Input required type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={v.phone} onChange={set("phone")} /></Field>
          <Field label={t("ver.note")}><Input value={v.note} maxLength={500} onChange={set("note")} /></Field>
          {error && <p role="alert" className="text-xs text-neg sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {state === "rejected" ? t("ver.resubmit") : t("ver.submit")}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
