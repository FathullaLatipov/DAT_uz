import Link from "next/link";
import { CalendarDays, Package } from "lucide-react";
import type { OfferWithRels } from "@/server/services/freight";
import { label } from "@/server/domain/enums";
import { km, money, perKm, relativeDay, tonnes, usd } from "@/lib/format";
import { DemoBadge } from "../ui/primitives";
import { Freshness, QualityBadge, RouteLabel } from "../loads/parts";

/** Marketplace "product card" for a load — public, no per-truck data. */
export function LoadTile({ o }: { o: OfferWithRels }) {
  const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
  const sources = new Set(o.listings.map((l) => l.sourceId)).size;
  return (
    <Link href={`/load/${o.id}`} className="group flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop">
      <RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" />
      <div className="mt-1 text-xs text-muted">{km(o.distanceKm)}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" />{tonnes(o.weightKg)} · {label(o.bodyType)}</span>
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{relativeDay(o.loadingDate)}</span>
      </div>
      <div className="text-xs text-subtle">{label(o.cargoType)}</div>
      <div className="mt-auto pt-4">
        {o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE") ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="num text-xl font-semibold">{usd(o.rateUsd)}</span>
            <span className="num text-xs text-muted">{perKm(o.rateUsd / o.distanceKm)}</span>
          </div>
        ) : (
          <div className="text-sm font-medium text-muted">{o.rateUsd > 0 ? "Rate unverified" : "Rate negotiable"}</div>
        )}
        {o.currency !== "USD" && o.rate > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE") && <div className="num text-xs text-subtle">{money(o.rate, o.currency)} original</div>}
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          <QualityBadge quality={o.quality} />
          {sources > 1 && <span className="text-xs text-info">{sources} sources</span>}
          {o.isDemo && <DemoBadge />}
          <span className="ml-auto"><Freshness lastSeen={lastSeen} /></span>
        </div>
      </div>
    </Link>
  );
}
