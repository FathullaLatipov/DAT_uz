"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, Layers, ShieldAlert } from "lucide-react";
import { getCity } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { cn, isStale } from "@/lib/format";
import type { LoadRow } from "@/server/services/freight";
import type { GradeResult } from "@/server/services/grade";
import { Badge, DemoBadge, ScoreBadge } from "../ui/primitives";

/**
 * Small display pieces used by both server and client components. They are client components so
 * they can read the visitor's language from context — a server component can render them, and so
 * can the interactive tables. Re-exported from parts.tsx, which most pages import from.
 */

export function RouteLabel({ origin, dest, size = "md", className }: { origin: string; dest: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const { city } = useI18n();
  const o = getCity(origin);
  const d = getCity(dest);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-semibold", size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-[15px]", className)}>
      <CountryTag code={o?.country} />
      <span className="truncate">{city(origin)}</span>
      <ArrowRight className={cn("shrink-0 text-subtle", size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5")} />
      <CountryTag code={d?.country} />
      <span className="truncate">{city(dest)}</span>
    </span>
  );
}

/** Country code chip. Emoji flags render as bare letters on Windows, so we use a consistent tag. */
export function CountryTag({ code }: { code?: string }) {
  const { country } = useI18n();
  if (!code) return null;
  return (
    <span title={country(code)} className="shrink-0 rounded border border-border bg-surface-2 px-1 py-px font-mono text-xs font-medium leading-none text-muted">
      {code}
    </span>
  );
}

export const GRADE_TONE = { A: "pos", B: "info", C: "warn", D: "neg" } as const;

/** DAT-style letter: how far to trust this posting. The tooltip lists what pushed it up or down. */
export function GradeBadge({ grade, className }: { grade: GradeResult; className?: string }) {
  const { t } = useI18n();
  const reasons = grade.reasons.map((r) => `${r.good ? "✓" : "✗"} ${t(`grade.reason.${r.code}`)}`).join("\n");
  return (
    <Badge tone={GRADE_TONE[grade.grade]} className={cn("min-w-[1.75rem] justify-center font-bold", className)} title={`${t("grade.title", { g: grade.grade, score: grade.score })}\n${t(`grade.legend.${grade.grade}`)}\n\n${reasons}`}>
      {grade.grade}
    </Badge>
  );
}

export function QualityBadge({ quality, flags }: { quality: string; flags?: string[] }) {
  const { t } = useI18n();
  const relevant = (flags ?? []).filter((f) => f !== "EXPIRED");
  if (quality === "VERIFIED")
    return (
      <Badge tone="pos" title={t("parts.verifiedTitle")}>
        <BadgeCheck className="h-3 w-3" /> {t("parts.verified")}
      </Badge>
    );
  if (quality === "UNVERIFIED")
    return (
      <Badge tone="neg" title={relevant.join(", ")}>
        <ShieldAlert className="h-3 w-3" /> {t("parts.unverified")}
      </Badge>
    );
  return <Badge tone="warn" title={relevant.join(", ") || t("parts.brokerNotVerified")}>{t("parts.partial")}</Badge>;
}

export function Freshness({ lastSeen }: { lastSeen: Date | string }) {
  const { t, ago } = useI18n();
  const stale = isStale(lastSeen);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", stale ? "text-warn" : "text-subtle")} title={t("parts.lastConfirmed", { ago: ago(lastSeen) })}>
      <Clock className="h-3 w-3" />
      {stale ? t("parts.possiblyOutdated") : t("parts.updated", { ago: ago(lastSeen) })}
    </span>
  );
}

export function Sources({ sources, demo }: { sources: { id: string; name: string }[]; demo?: boolean }) {
  const { t, tn } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sources.length > 1 && (
        <Badge tone="info" title={t("parts.sourcesMerged", { n: sources.length })}>
          <Layers className="h-3 w-3" /> {tn("parts.sources", sources.length)}
        </Badge>
      )}
      {sources.length === 1 && <Badge>{sources[0].name}</Badge>}
      {demo && <DemoBadge />}
    </span>
  );
}

/**
 * Mobile-first card. Designed so the key facts read in one glance. Plain link by default
 * (used for the compact map-view preview grid); pass `expanded`/`onToggle` to make it behave
 * like a table row instead — tapping expands an inline detail panel rendered by the caller,
 * same pattern as the desktop table's expandable rows.
 */
export function LoadCard({ row, compact, expanded, onToggle }: { row: LoadRow; compact?: boolean; expanded?: boolean; onToggle?: () => void }) {
  const { t, label, km, tonnes, relativeDay, usd, perKm, money } = useI18n();
  const o = row.offer;
  const m = row.match;
  const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
  const className = cn(
    "group block min-w-0 border border-border bg-surface p-4 shadow-card transition hover:border-border-strong hover:shadow-pop",
    onToggle ? (expanded ? "rounded-t-xl border-brand/40 bg-brand-soft/10" : "cursor-pointer rounded-xl") : "rounded-xl",
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <RouteLabel origin={o.originCityId} dest={o.destCityId} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="num">{km(o.distanceKm)}</span>·<span>{tonnes(o.weightKg)}</span>·<span>{label(o.bodyType)}</span>·<span>{relativeDay(o.loadingDate)}</span>
          </div>
        </div>
        {m && <ScoreBadge score={m.score} eligible={m.eligible} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          {o.rateUsd > 0 ? (
            <>
              <div className="num text-lg font-semibold">{usd(o.rateUsd)}</div>
              <div className="num text-xs text-muted">
                {perKm(o.rateUsd / o.distanceKm)}
                {o.currency !== "USD" && <span className="text-subtle"> · {money(o.rate, o.currency)}</span>}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">{t("tile.rateNegotiable")}</div>
          )}
        </div>
        {m && m.eligible && o.rateUsd > 0 && (
          <div className="text-right">
            <div className={cn("num text-sm font-semibold", m.profit.profit >= 0 ? "text-pos" : "text-neg")}>{usd(m.profit.profit)}</div>
            <div className="text-xs text-subtle">{t("board.estProfitFor", { code: row.truckCode ?? "" })}</div>
          </div>
        )}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <GradeBadge grade={row.grade} />
            <Sources sources={row.sources} demo={o.isDemo} />
          </div>
          <Freshness lastSeen={lastSeen} />
        </div>
      )}
    </>
  );
  if (onToggle) {
    return (
      <div
        className={className}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {content}
      </div>
    );
  }
  return (
    <Link href={`/app/loads/${o.id}`} className={className}>
      {content}
    </Link>
  );
}
