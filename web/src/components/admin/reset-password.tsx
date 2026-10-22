"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { useDialog } from "../ui/dialog";
import { Button, Input } from "../ui/primitives";

/** Admin card: give a person a new temporary password. It is shown here once; the person is told and signed out everywhere. */
export function ResetPassword() {
  const { t } = useI18n();
  const dialog = useDialog();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; name: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    if (!(await dialog.confirm({ title: t("pw.adminConfirmTitle", { email: target }), message: t("pw.adminConfirmBody"), confirmText: t("pw.adminReset"), danger: true }))) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      setResult(await apiCall<{ email: string; name: string; temporaryPassword: string }>("/api/admin/users/reset-password", "POST", { email: target }));
      setEmail("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      /* the password is on screen; copying by hand works */
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t("pw.adminHint")}</p>
      <form onSubmit={reset} className="flex flex-wrap items-center gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="h-9 min-w-0 flex-1 sm:max-w-xs" aria-label={t("pw.adminEmail")} />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} {t("pw.adminReset")}
        </Button>
      </form>
      {error && <p role="alert" className="text-xs text-neg">{error}</p>}
      {result && (
        <div role="status" className="rounded-lg border border-pos/30 bg-pos-soft p-3 text-sm">
          <div className="font-medium">{t("pw.adminDone", { name: result.name, email: result.email })}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-2 py-1 font-mono text-base tracking-wide">{result.temporaryPassword}</code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("pw.copied") : t("pw.copy")}</Button>
          </div>
          <p className="mt-2 text-xs text-muted">{t("pw.adminNote")}</p>
        </div>
      )}
    </div>
  );
}
