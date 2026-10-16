import Link from "next/link";
import { getCity } from "@/server/domain/geo";
import { label } from "@/server/domain/enums";
import { cn, money, perKm, relativeDay, tonnes, usd, km } from "@/lib/format";
import { ScoreBadge } from "../ui/primitives";
import type { LoadRow } from "@/server/services/freight";

export const cityLabel = (id: string) => getCity(id)?.name ?? id;

// Translated display pieces live in parts-shared.tsx (client components that read the language).
export { CountryTag, Freshness, QualityBadge, RouteLabel, Sources } from "./parts-shared";
import { Freshness, QualityBadge, RouteLabel, Sources } from "./parts-shared";

/**
 * Mobile-first card. Designed so the key facts read in one glance. Plain link by default
 * (used for the compact map-view preview grid); pass `expanded`/`onToggle` to make it behave
 * like a table row instead — tapping expands an inline detail panel rendered by the caller,
 * same pattern as the desktop table's expandable rows.
 */
export function LoadCard({ row, compact, expanded, onToggle }: { row: LoadRow; compact?: boolean; expanded?: boolean; onToggle?: () => void }) {
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
            <div className="text-sm text-muted">Rate negotiable</div>
          )}
        </div>
        {m && m.eligible && o.rateUsd > 0 && (
          <div className="text-right">
            <div className={cn("num text-sm font-semibold", m.profit.profit >= 0 ? "text-pos" : "text-neg")}>{usd(m.profit.profit)}</div>
            <div className="text-xs text-subtle">est. profit · {row.truckCode}</div>
          </div>
        )}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <QualityBadge quality={o.quality} flags={row.flags} />
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
