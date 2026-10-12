import Link from "next/link";
import { label } from "@/server/domain/enums";
import type { LoadRow } from "@/server/services/freight";
import { cn, km, money, perKm, relativeDay, tonnes, usd } from "@/lib/format";
import { DemoBadge, ScoreBadge } from "../ui/primitives";
import { Freshness, QualityBadge, RouteLabel, Sources } from "./parts";
import { FavoriteButton } from "./favorite-button";

/** Dense desktop table. Each row is a link; the star is an independent control. */
export function LoadTable({ rows }: { rows: LoadRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-14 px-3 py-2.5 font-medium">Match</th>
              <th className="px-3 py-2.5 font-medium">Route</th>
              <th className="px-3 py-2.5 font-medium">Loading</th>
              <th className="px-3 py-2.5 font-medium">Cargo</th>
              <th className="px-3 py-2.5 text-right font-medium">Rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Deadhead</th>
              <th className="px-3 py-2.5 text-right font-medium">Est. profit</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="w-10 px-2 py-2.5" />
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
                    <FavoriteButton offerId={o.id} initial={r.favorite} />
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
