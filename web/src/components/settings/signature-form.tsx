"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { buildEnquiry, type Sender } from "@/lib/enquiry";
import { Button, Field, Input } from "../ui/primitives";

export interface SignatureValues { jobTitle: string; phone: string; website: string; address: string; taxId: string }

/** Settings: what goes under the e-mails sent from a load's contact button, with a live preview. */
export function SignatureForm({ initial, name, org, canEditCompany }: { initial: SignatureValues; name: string; org: string; canEditCompany: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof SignatureValues) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setSaved(false); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiCall("/api/profile", "PATCH", canEditCompany ? v : { jobTitle: v.jobTitle });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const from: Sender = { name, jobTitle: v.jobTitle, org, taxId: v.taxId, phone: v.phone, website: v.website, address: v.address };
  const sample = buildEnquiry(i18n, { originId: "tashkent", destId: "almaty", weightKg: 20000, bodyType: "CURTAINSIDER", loadingDate: new Date(Date.now() + 86_400_000).toISOString(), rateUsd: 0, truck: { code: "T-1001", bodyType: "CURTAINSIDER", capacityKg: 20000 } }, { name: null }, from);

  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <p className="text-sm text-muted">{t("prof.subtitle")}</p>
        <Field label={t("prof.jobTitle")}><Input value={v.jobTitle} maxLength={80} onChange={set("jobTitle")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("prof.phone")}><Input type="tel" inputMode="tel" value={v.phone} disabled={!canEditCompany} onChange={set("phone")} placeholder="+998 71 123 45 67" /></Field>
          <Field label={t("prof.taxId")}><Input value={v.taxId} disabled={!canEditCompany} onChange={set("taxId")} /></Field>
        </div>
        <Field label={t("prof.website")}><Input type="url" inputMode="url" value={v.website} disabled={!canEditCompany} onChange={set("website")} placeholder="https://" /></Field>
        <Field label={t("prof.address")}><Input value={v.address} maxLength={200} disabled={!canEditCompany} onChange={set("address")} /></Field>
        <p className="text-xs text-subtle">{t("prof.orgNote", { org })}</p>
        {error && <p role="alert" className="text-xs text-neg">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t("prof.save")}</Button>
          {saved && <span role="status" className="text-sm text-pos">{t("prof.saved")}</span>}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 text-xs font-medium text-muted">{t("prof.preview")}</div>
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <div className="mb-2 border-b border-border pb-2 text-sm font-medium">{sample.subject}</div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted">{sample.body}</pre>
        </div>
      </div>
    </form>
  );
}
