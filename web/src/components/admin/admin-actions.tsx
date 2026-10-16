"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { Button } from "../ui/primitives";
import { CSV_COLUMNS } from "@/server/ingestion/adapters/csv";

export function SyncButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const r = await apiCall<{ results: { sourceId: string; status: string; fetched: number; created: number; duplicates: number }[] }>("/api/admin/sync");
      setMsg(r.results.filter((x) => x.status !== "SKIPPED").map((x) => t("adm.syncLine", { id: x.sourceId, fetched: x.fetched, created: x.created, dup: x.duplicates })).join(" · "));
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t("adm.syncAll")}</Button>
      {msg && <span className="max-w-md text-right text-xs text-muted">{msg}</span>}
    </div>
  );
}

export function CsvImport() {
  const { t } = useI18n();
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function onFile(f: File | undefined) {
    if (f) setCsv(await f.text());
  }
  async function submit() {
    setPending(true);
    setMsg(null);
    try {
      const r = await apiCall<{ stats: { fetched: number; created: number; duplicates: number; rejected: number; updated: number } }>("/api/admin/import", "POST", { csv });
      const s = r.stats;
      setMsg(t("adm.imported", { fetched: s.fetched, created: s.created, updated: s.updated, dup: s.duplicates, rejected: s.rejected }));
      setCsv("");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{t("adm.columns")} <code className="text-xs">{CSV_COLUMNS.join(", ")}</code>. {t("adm.rights")}</p>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder={t("adm.csvPlaceholder")} className="w-full rounded-lg border border-border bg-bg p-2.5 font-mono text-xs outline-none focus:border-brand" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] hover:bg-surface-2">
          <Upload className="h-4 w-4" /> {t("adm.chooseFile")}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Button size="sm" onClick={submit} disabled={pending || csv.length < 10}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t("adm.import")}</Button>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
