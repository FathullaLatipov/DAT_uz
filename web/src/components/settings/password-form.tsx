"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { checkNewPassword, MIN_PASSWORD } from "@/lib/password";
import { Button, Field, Input } from "../ui/primitives";

/** Settings → Security: change your own password. */
export function PasswordForm() {
  const { t } = useI18n();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => (setDone(false), setV((s) => ({ ...s, [k]: e.target.value })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const problem = checkNewPassword(v.next, { current: v.current, confirm: v.confirm });
    if (problem) {
      setError(t(`pw.problem.${problem}`, { n: MIN_PASSWORD }));
      return;
    }
    setPending(true);
    try {
      await apiCall("/api/account/password", "PATCH", { currentPassword: v.current, newPassword: v.next });
      setV({ current: "", next: "", confirm: "" });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" autoComplete="off">
      <p className="text-sm text-muted">{t("pw.subtitle")}</p>
      <Field label={t("pw.current")}><Input type="password" required autoComplete="current-password" value={v.current} onChange={set("current")} /></Field>
      <Field label={t("pw.new")} hint={t("pw.hint", { n: MIN_PASSWORD })}><Input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={v.next} onChange={set("next")} /></Field>
      <Field label={t("pw.confirm")}><Input type="password" required autoComplete="new-password" value={v.confirm} onChange={set("confirm")} /></Field>
      {error && <p role="alert" className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
      {done && <p role="status" className="rounded-lg bg-pos-soft px-3 py-2 text-sm text-pos">{t("pw.changed")}</p>}
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t("pw.save")}</Button>
    </form>
  );
}
