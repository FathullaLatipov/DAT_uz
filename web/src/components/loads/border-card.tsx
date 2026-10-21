"use client";

import { Flag } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { BorderSummary } from "@/server/domain/borders";
import { cn } from "@/lib/format";
import { Card, CardHeader } from "../ui/primitives";

/**
 * The borders a truck passes on this load's corridor: typical time, fees and papers. Planning
 * figures, said so. `compact` drops the Card chrome for use inside another panel's own box (the
 * expandable-row detail panel), keeping the same data and copy.
 */
export function BorderCard({ summary, compact }: { summary: BorderSummary; compact?: boolean }) {
  const { t, country, usd } = useI18n();
  if (!summary.crossings.length) return null;
  const range = (lo: number, hi: number) => (lo === hi ? t("bd.hours", { n: hi }) : t("bd.hoursRange", { lo, hi }));

  const body = (
    <div className={compact ? "space-y-2 text-xs" : "space-y-3 px-4 pb-5 text-sm sm:px-5"}>
      <ul className="space-y-2">
        {summary.crossings.map((c) => (
          <li key={`${c.from}-${c.to}`} className={cn("rounded-lg border border-border p-3", compact ? "bg-surface" : "bg-surface-2/50")}>
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
      {!compact && <p className="text-xs text-subtle">{t("bd.note")}</p>}
    </div>
  );

  if (compact) {
    return (
      <div className="rounded-lg border border-border bg-surface p-2.5">
        <div className="text-xs font-medium text-fg">{t("bd.title")}</div>
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader title={t("bd.title")} subtitle={t("bd.subtitle", { n: summary.crossings.length })} />
      {body}
    </Card>
  );
}
