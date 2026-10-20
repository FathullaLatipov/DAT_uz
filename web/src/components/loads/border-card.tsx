"use client";

import { Flag } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { BorderSummary } from "@/server/domain/borders";
import { Card, CardHeader } from "../ui/primitives";

/** The borders a truck passes on this load's corridor: typical time, fees and papers. Planning figures, said so. */
export function BorderCard({ summary }: { summary: BorderSummary }) {
  const { t, country, usd } = useI18n();
  if (!summary.crossings.length) return null;
  const range = (lo: number, hi: number) => (lo === hi ? t("bd.hours", { n: hi }) : t("bd.hoursRange", { lo, hi }));
  return (
    <Card>
      <CardHeader title={t("bd.title")} subtitle={t("bd.subtitle", { n: summary.crossings.length })} />
      <div className="space-y-3 px-4 pb-5 text-sm sm:px-5">
        <ul className="space-y-2">
          {summary.crossings.map((c) => (
            <li key={`${c.from}-${c.to}`} className="rounded-lg border border-border bg-surface-2/50 p-3">
              <div className="flex items-center gap-2 font-medium"><Flag className="h-3.5 w-3.5 text-brand" /> {country(c.from)} → {country(c.to)}</div>
              <div className="mt-1 text-xs text-muted">
                {t("bd.wait", { range: range(c.hoursLow, c.hoursHigh) })}
                {c.feeUsd > 0 ? ` · ${t("bd.fee", { fee: usd(c.feeUsd) })}` : ` · ${t("bd.noFee")}`}
              </div>
              <div className="mt-1 text-xs text-subtle">{t("bd.docs", { docs: c.docs.map((d) => t(`bd.doc.${d}`)).join(", ") })}</div>
            </li>
          ))}
        </ul>
        <p className="num text-xs text-muted">{t("bd.total", { range: range(summary.hoursLow, summary.hoursHigh), fee: usd(summary.feeUsd) })}</p>
        <p className="text-xs text-subtle">{t("bd.note")}</p>
      </div>
    </Card>
  );
}
