import Link from "next/link";
import { AlertTriangle, Check, Flame } from "lucide-react";
import type { Recommendation } from "@/server/services/freight";
import { getI18n } from "@/i18n/server";
import { RouteLabel } from "./parts";
import { Badge, DemoBadge, LinkButton, ScoreBadge } from "../ui/primitives";
import { cn } from "@/lib/format";

export async function TopMatch({ rec }: { rec: Recommendation }) {
  const { t: tr, label, km, perKm, relativeDay, usd } = await getI18n();
  const { offer: o, match: m, truck: t } = rec;
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border border-brand/30 bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-soft/60 px-4 py-2.5 sm:px-5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
          <Flame className="h-4 w-4" /> {tr("rec.topMatch", { code: t.code })}
        </span>
        {o.isDemo && <DemoBadge />}
      </div>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <RouteLabel origin={o.originCityId} dest={o.destCityId} size="lg" />
              <p className="mt-1 text-sm text-muted">
                {label(o.cargoType)} · {(o.weightKg / 1000).toFixed(1)} {tr("units.tonnes")} · {label(o.bodyType)} · {tr("rec.loadingDay", { day: relativeDay(o.loadingDate) })}
              </p>
            </div>
            <ScoreBadge score={m.score} size="lg" />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-3">
            {[
              [tr("rec.rate"), usd(o.rateUsd)],
              [tr("rec.ratePerKm"), perKm(o.rateUsd / o.distanceKm)],
              [tr("rec.distance"), km(o.distanceKm)],
              [tr("rec.deadhead"), km(m.deadheadKm)],
              [tr("rec.estFuel"), usd(m.profit.fuel)],
              [tr("rec.estProfit"), usd(m.profit.profit)],
            ].map(([k, v], i) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className={cn("num mt-0.5 text-[15px] font-semibold", i === 5 && (m.profit.profit >= 0 ? "text-pos" : "text-neg"))}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href={`/app/loads/${o.id}?truck=${t.id}`}>{tr("rec.viewAnalyze")}</LinkButton>
            <LinkButton href={`/app/loads/${o.id}?truck=${t.id}#assign`} variant="outline">
              {tr("rec.assignTo", { code: t.code })}
            </LinkButton>
          </div>
        </div>
        <div className="rounded-lg bg-surface-2 p-4">
          <h3 className="text-sm font-semibold">{tr("rec.whyThis")}</h3>
          <ul className="mt-2.5 space-y-2">
            {m.reasons.slice(0, 5).map((r) => (
              <li key={r} className="flex gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" />
                <span>{r}</span>
              </li>
            ))}
            {m.warnings.slice(0, 2).map((w) => (
              <li key={w} className="flex gap-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export async function RecRow({ rec }: { rec: Recommendation }) {
  const { t: tr, city, relativeDay, usd, km } = await getI18n();
  const { offer: o, match: m, truck: t } = rec;
  return (
    <Link href={`/app/loads/${o.id}?truck=${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 sm:px-5">
      <ScoreBadge score={m.score} size="sm" />
      <div className="min-w-0 flex-1">
        <RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" />
        <div className="truncate text-xs text-muted">
          {t.code} · {m.deadheadKm ? tr("rec.emptyTo", { km: km(m.deadheadKm), city: city(o.originCityId) }) : tr("rec.atPickup")} · {relativeDay(o.loadingDate)}
        </div>
      </div>
      <div className="text-right">
        <div className="num text-sm font-semibold">{usd(o.rateUsd)}</div>
        <div className={cn("num text-xs", m.profit.profit >= 0 ? "text-pos" : "text-neg")}>{tr("rec.profit", { amount: usd(m.profit.profit) })}</div>
      </div>
    </Link>
  );
}

export async function MatchingBadge({ score }: { score: number }) {
  const { t } = await getI18n();
  return <Badge tone={score >= 85 ? "pos" : score >= 70 ? "brand" : "warn"}>{t("rec.matchPct", { n: score })}</Badge>;
}
