"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ArrowDown, ArrowUpDown, ChevronRight, Zap } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { LoadRow } from "@/server/services/freight";
import type { LoadFilters } from "@/server/services/filters";
import { filtersToParams } from "@/server/services/filters";
import { cn } from "@/lib/format";
import { DemoBadge, ScoreBadge } from "../ui/primitives";
import { Freshness, GradeBadge, RouteLabel, Sources } from "./parts";
import { FavoriteButton } from "./favorite-button";
import { LoadDetailPanel } from "./load-detail-panel";
import { useExpandableRow } from "./use-expandable-row";

type SortKey = "rate" | "ratePerKm" | "profit" | "deadhead" | "loading";

/** Dense desktop table. Clicking a row expands an inline detail panel underneath it (DAT-style)
 * instead of navigating away; links, the star and the sort-by-column headers remain independent
 * controls via stopPropagation. Headers are sticky so a long result list stays scannable while
 * scrolling.
 *
 * `filters`/`view` (not a `sortHref` closure) build the sort links internally — a Server
 * Component parent can't hand a plain function prop across to a Client Component. */
export function LoadTable({ rows, filters, view }: { rows: LoadRow[]; filters: LoadFilters; view: string }) {
  const { toggle, isOpen, containerRef } = useExpandableRow();
  const { t, label, km, money, perKm, relativeDay, tonnes, usd } = useI18n();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const sort = filters.sort;
  const sortHref = (key: SortKey) => {
    const q = filtersToParams({ ...filters, sort: key });
    if (view !== "list") q.set("view", view);
    return `/app/loads?${q.toString()}`;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div ref={containerRef} className="max-h-[calc(100dvh-13rem)] overflow-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted backdrop-blur">
              <th className="w-8 px-2 py-2.5" />
              <th className="w-14 px-3 py-2.5 font-medium">{t("table.match")}</th>
              <th className="px-3 py-2.5 font-medium">{t("table.route")}</th>
              <SortableTh label={t("table.loading")} sortKey="loading" current={sort} href={sortHref} />
              <th className="px-3 py-2.5 font-medium">{t("table.cargo")}</th>
              <SortableTh label={t("table.rate")} sortKey="rate" current={sort} href={sortHref} align="right" />
              <SortableTh label={t("table.deadhead")} sortKey="deadhead" current={sort} href={sortHref} align="right" />
              <SortableTh label={t("table.estProfit")} sortKey="profit" current={sort} href={sortHref} align="right" />
              <th className="px-3 py-2.5 font-medium">{t("table.source")}</th>
              <th className="w-20 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const o = r.offer;
              const m = r.match;
              const open = isOpen(o.id);
              const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
              return (
                <Fragment key={o.id}>
                  <tr
                    data-row-id={o.id}
                    className={cn("group animate-fade-up cursor-pointer transition-colors hover:bg-surface-2/70", open && "bg-brand-soft/40 hover:bg-brand-soft/40")}
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => toggle(o.id)}
                    aria-selected={open}
                  >
                    <td className="px-2 py-2.5">
                      {/* A real <button> so Enter/Space work without a bespoke key handler — its
                          click bubbles to the row's onClick, so no handler is attached here. */}
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`load-detail-${o.id}`}
                        aria-label={open ? t("table.collapse") : t("table.expand")}
                        className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface-3 hover:text-fg"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90 text-brand")} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">{m ? <ScoreBadge score={m.score} eligible={m.eligible} size="sm" /> : "—"}</td>
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
                      {o.rateUsd > 0 ? (
                        <>
                          <div className="font-semibold">{usd(o.rateUsd)}</div>
                          <div className="text-xs text-muted">{perKm(o.rateUsd / o.distanceKm)}{o.currency !== "USD" && ` · ${money(o.rate, o.currency)}`}</div>
                        </>
                      ) : (
                        <span className="text-muted">{t("table.negotiable")}</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right">
                      {m ? (
                        <>
                          <div>{km(m.deadheadKm)}</div>
                          <div className="text-xs text-muted">{r.truckCode}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className={cn("num whitespace-nowrap px-3 py-2.5 text-right font-semibold", m && m.profit.profit < 0 ? "text-neg" : "text-pos")}>
                      {m && m.eligible && o.rateUsd > 0 ? usd(m.profit.profit) : <span className="font-normal text-subtle">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <GradeBadge grade={r.grade} />
                        <Sources sources={r.sources} />
                        {o.isDemo && <DemoBadge />}
                      </div>
                    </td>
                    <td className="px-2 py-2.5" onClick={stop}>
                      <div className="flex items-center justify-end gap-1">
                        {m?.eligible && (
                          <Link
                            href={`/app/loads/${o.id}?truck=${m.truckId}#assign`}
                            title={t("table.takeLoad")}
                            aria-label={t("table.takeLoad")}
                            className="hidden h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-brand-soft hover:text-brand group-hover:inline-flex"
                          >
                            <Zap className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <FavoriteButton offerId={o.id} initial={r.favorite} />
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={10} className="p-0" id={`load-detail-${o.id}`}>
                        <LoadDetailPanel offerId={o.id} context="board" />
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

function SortableTh({ label: l, sortKey, current, href, align }: { label: string; sortKey: SortKey; current?: string; href: (key: SortKey) => string; align?: "right" }) {
  const active = current === sortKey;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
      <Link href={href(sortKey)} className={cn("group inline-flex items-center gap-1 hover:text-fg", active && "text-fg", align === "right" && "flex-row-reverse")}>
        {l}
        {active ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
      </Link>
    </th>
  );
}
