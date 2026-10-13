import Link from "next/link";
import { ArrowDown, ArrowUpDown, Zap } from "lucide-react";
import { label } from "@/server/domain/enums";
import type { LoadRow } from "@/server/services/freight";
import { cn, km, money, perKm, relativeDay, tonnes, usd } from "@/lib/format";
import { DemoBadge, ScoreBadge } from "../ui/primitives";
import { Freshness, QualityBadge, RouteLabel, Sources } from "./parts";
import { FavoriteButton } from "./favorite-button";

type SortKey = "rate" | "ratePerKm" | "profit" | "deadhead" | "loading";

/** Dense desktop table. Each row is a link; the star and the sort-by-column headers are
 * independent controls. Headers are sticky so a long result list stays scannable while
 * scrolling, matching a DAT-style load board rather than a long card list. */
export function LoadTable({ rows, sort, sortHref }: { rows: LoadRow[]; sort?: string; sortHref: (key: SortKey) => string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="max-h-[calc(100dvh-13rem)] overflow-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted backdrop-blur">
              <th className="w-14 px-3 py-2.5 font-medium">Match</th>
              <th className="px-3 py-2.5 font-medium">Route</th>
              <SortableTh label="Loading" sortKey="loading" current={sort} href={sortHref} />
              <th className="px-3 py-2.5 font-medium">Cargo</th>
              <SortableTh label="Rate" sortKey="rate" current={sort} href={sortHref} align="right" />
              <SortableTh label="Deadhead" sortKey="deadhead" current={sort} href={sortHref} align="right" />
              <SortableTh label="Est. profit" sortKey="profit" current={sort} href={sortHref} align="right" />
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="w-20 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const o = r.offer;
              const m = r.match;
              const lastSeen = o.listings.reduce((a, l) => (l.lastSeenAt > a ? l.lastSeenAt : a), o.lastSeenAt);
              return (
                <tr key={o.id} className="group relative animate-fade-up transition-colors hover:bg-surface-2/70" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                  <td className="px-3 py-2.5">{m ? <ScoreBadge score={m.score} eligible={m.eligible} size="sm" /> : "—"}</td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <Link href={`/app/loads/${o.id}${m ? `?truck=${m.truckId}` : ""}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                      <RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" />
                    </Link>
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
                      <span className="text-muted">Negotiable</span>
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
                      <QualityBadge quality={o.quality} flags={r.flags} />
                      <Sources sources={r.sources} />
                      {o.isDemo && <DemoBadge />}
                    </div>
                  </td>
                  <td className="relative z-10 px-2 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {m?.eligible && (
                        <Link
                          href={`/app/loads/${o.id}?truck=${m.truckId}#assign`}
                          title="Take this load"
                          aria-label="Take this load"
                          className="hidden h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-brand-soft hover:text-brand group-hover:inline-flex"
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </Link>
                      )}
                      <FavoriteButton offerId={o.id} initial={r.favorite} />
                    </div>
                  </td>
                </tr>
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
