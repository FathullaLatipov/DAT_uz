import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, Layers, ShieldAlert } from "lucide-react";
import { countryName, getCity } from "@/server/domain/geo";
import { label } from "@/server/domain/enums";
import { ago, cn, isStale, money, perKm, relativeDay, tonnes, usd, km } from "@/lib/format";
import { Badge, DemoBadge, ScoreBadge } from "../ui/primitives";
import type { LoadRow } from "@/server/services/freight";

export const cityLabel = (id: string) => getCity(id)?.name ?? id;

export function RouteLabel({ origin, dest, size = "md", className }: { origin: string; dest: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const o = getCity(origin);
  const d = getCity(dest);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-semibold", size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-[15px]", className)}>
      <CountryTag code={o?.country} />
      <span className="truncate">{o?.name ?? origin}</span>
      <ArrowRight className={cn("shrink-0 text-subtle", size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5")} />
      <CountryTag code={d?.country} />
      <span className="truncate">{d?.name ?? dest}</span>
    </span>
  );
}

/** Country code chip. Emoji flags render as bare letters on Windows, so we use a consistent tag. */
export function CountryTag({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <span title={countryName(code)} className="shrink-0 rounded border border-border bg-surface-2 px-1 py-px font-mono text-xs font-medium leading-none text-muted">
      {code}
    </span>
  );
}

export function QualityBadge({ quality, flags }: { quality: string; flags?: string[] }) {
  const relevant = (flags ?? []).filter((f) => f !== "EXPIRED");
  if (quality === "VERIFIED")
    return (
      <Badge tone="pos" title="No data-quality issues; broker verified or confirmed by 2+ sources">
        <BadgeCheck className="h-3 w-3" /> Verified
      </Badge>
    );
  if (quality === "UNVERIFIED")
    return (
      <Badge tone="neg" title={relevant.join(", ")}>
        <ShieldAlert className="h-3 w-3" /> Unverified
      </Badge>
    );
  return <Badge tone="warn" title={relevant.join(", ") || "Broker not verified"}>Partially verified</Badge>;
}

export function Freshness({ lastSeen }: { lastSeen: Date | string }) {
  const stale = isStale(lastSeen);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", stale ? "text-warn" : "text-subtle")} title={`Last confirmed by a source ${ago(lastSeen)}`}>
      <Clock className="h-3 w-3" />
      {stale ? "Possibly outdated" : `Updated ${ago(lastSeen)}`}
    </span>
  );
}

export function Sources({ sources, demo }: { sources: { id: string; name: string }[]; demo?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sources.length > 1 && (
        <Badge tone="info" title={`Same load found on ${sources.length} sources — merged into one opportunity`}>
          <Layers className="h-3 w-3" /> {sources.length} sources
        </Badge>
      )}
      {sources.length === 1 && <Badge>{sources[0].name}</Badge>}
      {demo && <DemoBadge />}
    </span>
  );
}

/** Mobile-first card. Designed so the key facts read in one glance. */
export function LoadCard({ row, compact }: { row: LoadRow; compact?: boolean }) {
  const o = row.offer;
  const m = row.match;
  const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
  return (
    <Link href={`/app/loads/${o.id}`} className="group block min-w-0 rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-border-strong hover:shadow-pop">
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
    </Link>
  );
}
