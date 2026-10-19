"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Eye, EyeOff, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { useDialog } from "../ui/dialog";
import { Button } from "../ui/primitives";

/** Runs one admin action behind a button: confirm (optional) → request → refresh the page, errors in a dialog. */
function useAction() {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    try {
      await call();
      router.refresh();
    } catch (e) {
      await dialog.alert({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return { busy, run, dialog };
}

/** Approve / reject one verification request. */
export function VerificationActions({ id, company }: { id: string; company: string }) {
  const { t } = useI18n();
  const { busy, run, dialog } = useAction();
  async function approve() {
    if (!(await dialog.confirm({ title: t("av.approveTitle", { company }), message: t("av.approveBody"), confirmText: t("av.approve") }))) return;
    await run(() => apiCall(`/api/admin/verifications/${id}`, "POST", { decision: "approve" }));
  }
  async function reject() {
    const reason = await dialog.prompt({ title: t("av.rejectTitle"), message: t("av.rejectBody"), label: t("av.rejectLabel"), defaultValue: t("av.rejectDefault"), confirmText: t("av.reject"), maxLength: 500 });
    if (reason === null) return;
    await run(() => apiCall(`/api/admin/verifications/${id}`, "POST", { decision: "reject", reason }));
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={approve} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {t("av.approve")}
      </Button>
      <Button size="sm" variant="outline" onClick={reject} disabled={busy}>
        <X className="h-3.5 w-3.5" /> {t("av.reject")}
      </Button>
    </div>
  );
}

/** Give or remove a company's verified badge. */
export function BrokerVerifyButton({ id, verified }: { id: string; verified: boolean }) {
  const { t } = useI18n();
  const { busy, run } = useAction();
  return (
    <Button size="sm" variant={verified ? "outline" : "secondary"} disabled={busy} onClick={() => run(() => apiCall(`/api/admin/brokers/${id}`, "POST", { verified: !verified }))}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : verified ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />} {verified ? t("av.unverify") : t("av.verify")}
    </Button>
  );
}

/** Hide a posted load from the board, or put it back. */
export function LoadVisibilityButton({ id, active }: { id: string; active: boolean }) {
  const { t } = useI18n();
  const { busy, run, dialog } = useAction();
  async function toggle() {
    if (active && !(await dialog.confirm({ title: t("av.hideTitle"), message: t("av.hideBody"), danger: true, confirmText: t("av.hide") }))) return;
    await run(() => apiCall(`/api/admin/loads/${id}`, "POST", { status: active ? "EXPIRED" : "ACTIVE" }));
  }
  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {active ? t("av.hide") : t("av.restore")}
    </Button>
  );
}
