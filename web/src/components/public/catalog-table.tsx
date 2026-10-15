"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { OfferWithRels } from "@/server/services/freight";
import { label } from "@/server/domain/enums";
import { cn, km, money, perKm, relativeDay, tonnes, usd } from "@/lib/format";
import { DemoBadge } from "../ui/primitives";
import { Freshness, QualityBadge, RouteLabel, Sources } from "../loads/parts";
import { LoadDetailPanel } from "../loads/load-detail-panel";
import { useExpandableRow } from "../loads/use-expandable-row";

/** Dense desktop table for the public (no truck context) catalog — the anonymous-visitor
 * equivalent of the authenticated load board's table. Cards remain the mobile layout. Clicking
 * a row expands the same public-safe detail panel inline, no private data included. */
export function CatalogTable({ items }: { items: OfferWithRels[] }) {
  const { toggle, isOpen } = useExpandableRow();
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
      <div className="max-h-[calc(100dvh-13rem)] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-8 px-2 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Route</th>
              <th className="px-3 py-2.5 font-medium">Loading</th>
              <th className="px-3 py-2.5 font-medium">Equipment / Cargo</th>
              <th className="px-3 py-2.5 text-right font-medium">Rate</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((o, i) => {
              const open = isOpen(o.id);
              const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
              const sources = [...new Map(o.listings.map((l) => [l.sourceId, { id: l.sourceId, name: l.source.name }])).values()];
              return (
                <Fragment key={o.id}>
                  <tr
                    className={cn("group animate-fade-up cursor-pointer transition-colors hover:bg-surface-2/70", open && "bg-brand-soft/40 hover:bg-brand-soft/40")}
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => toggle(o.id)}
                    aria-selected={open}
                  >
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`catalog-detail-${o.id}`}
                        aria-label={open ? "Collapse details" : "Expand details"}
                        className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface-3 hover:text-fg"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90 text-brand")} />
                      </button>
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" />
                      <div className="num mt-0.5 text-xs text-muted">{km(o.distanceKm)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div>{relativeDay(o.loadingDate)}</div>
                      <Freshness lastSeen={lastSeen} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="whitespace-nowrap">{tonnes(o.weightKg)} · {label(o.bodyType)}</div>
                      <div className="text-xs text-muted">{label(o.cargoType)}</div>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right">
                      {o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE") ? (
                        <>
                          <div className="font-semibold">{usd(o.rateUsd)}</div>
                          <div className="text-xs text-muted">{perKm(o.rateUsd / o.distanceKm)}{o.currency !== "USD" && ` · ${money(o.rate, o.currency)}`}</div>
                        </>
                      ) : (
                        <span className="text-muted">{o.rateUsd > 0 ? "Unverified" : "Negotiable"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <QualityBadge quality={o.quality} />
                        <Sources sources={sources} />
                        {o.isDemo && <DemoBadge />}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="p-0" id={`catalog-detail-${o.id}`}>
                        <LoadDetailPanel offerId={o.id} context="catalog" />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
