"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { Button } from "../ui/primitives";

type Result =
  | { ok: true; text: string; summary: { origin: string; destination: string; weightKg: number; body: string | null; loading: string; rate: number | null; currency: string | null; phone: string | null }; offerId?: string; merged?: boolean }
  | { ok: false; text: string; problems: string[] };

const EXAMPLE = `Ташкент - Алматы, 20т тент, загрузка 25.10, 1300$, нал на выгрузке, +998 90 123 45 67

Фергана → Москва рефрижератор 18 тонн погрузка 27.10 ставка 3800 usd предоплата

Самарканд - Бишкек 12т изотерм завтра 900 у.е.`;

export function PasteImport() {
  const { t, tn, city, num } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(commit: boolean) {
    setPending(commit ? "commit" : "preview");
    setError(null);
    try {
      const r = await apiCall<{ results: Result[] }>("/api/loads/import", "POST", { text, commit });
      setResults(r.results);
      setDone(commit);
      if (commit) router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  const good = results?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {t("post.pasteIntro")}
      </p>
      <label className="block">
        <span className="sr-only">{t("post.adsText")}</span>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setResults(null); setDone(false); }} rows={7} maxLength={60000} placeholder={EXAMPLE}
          className="w-full rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => run(false)} disabled={pending !== null || text.trim().length < 12}>
          {pending === "preview" && <Loader2 className="h-4 w-4 animate-spin" />} {t("post.preview")}
        </Button>
        {results && good > 0 && !done && (
          <Button onClick={() => run(true)} disabled={pending !== null}>
            {pending === "commit" && <Loader2 className="h-4 w-4 animate-spin" />} {tn("post.publishN", good)}
          </Button>
        )}
        <button type="button" className="text-xs text-brand hover:underline" onClick={() => setText(EXAMPLE)}>{t("post.useExample")}</button>
      </div>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      {done && <p className="rounded-lg bg-pos-soft px-3 py-2 text-sm text-pos">{tn("post.publishedPre", good)} <Link href="/catalog?sort=newest" className="font-medium underline">{t("post.catalogLink")}</Link>{t("post.publishedPost")}</p>}
      {results && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((r, i) => (
            <li key={i} className="flex gap-3 px-3 py-2.5 text-sm">
              {r.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
              <div className="min-w-0">
                {r.ok ? (
                  <div>
                    <span className="font-medium">{city(r.summary.origin)} → {city(r.summary.destination)}</span>
                    <span className="text-muted"> · {r.summary.weightKg / 1000} {t("units.tonnes")} · {r.summary.body ?? t("post.bodyNotStated")} · {r.summary.loading} · {r.summary.rate ? `${num(r.summary.rate)} ${r.summary.currency}` : t("tile.rateNegotiable").toLowerCase()}{r.summary.phone && ` · ${r.summary.phone}`}</span>
                    {r.offerId && <Link href={`/load/${r.offerId}`} className="ml-2 text-brand hover:underline">{r.merged ? t("post.merged") : t("post.open")}</Link>}
                  </div>
                ) : (
                  <div className="text-warn">{r.problems.join("; ")}</div>
                )}
                <div className="truncate text-xs text-subtle">{r.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
