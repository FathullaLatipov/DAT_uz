import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Route as RouteIcon, Star, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { RouteLabel } from "@/components/loads/parts";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("mr.title") };
}

const PAGE_SIZE = 20;
const ACTIVE = ["PLANNED", "IN_TRANSIT"];
const DONE = ["COMPLETED", "CANCELLED"];
const TONE: Record<string, "pos" | "info" | "neutral" | "warn"> = { PLANNED: "info", IN_TRANSIT: "info", COMPLETED: "pos", CANCELLED: "neutral" };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= rating ? "h-4 w-4 fill-warn text-warn" : "h-4 w-4 text-border"} />)}
    </span>
  );
}

/** A carrier's trips: what is running now, and the whole history (every route, with money, km and reviews). */
export default async function MyRoutesPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const s = await requireSession();
  const { t, num, usd, km, dateTime } = await getI18n();
  const sp = await searchParams;
  const tab: "active" | "history" = sp.tab === "history" ? "history" : "active";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { orgId: s.orgId, status: { in: tab === "active" ? ACTIVE : DONE } };

  const [trips, total, nActive, nHistory, done, rating] = await Promise.all([
    db.trip.findMany({
      where,
      orderBy: tab === "active" ? { startedAt: "desc" } : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, status: true, originCityId: true, destCityId: true, startedAt: true, etaAt: true, completedAt: true, revenueUsd: true, costUsd: true, loadedKm: true, emptyKm: true, offerId: true,
        truck: { select: { id: true, code: true } },
        offer: { select: { id: true, broker: { select: { name: true } } } },
        review: { select: { id: true } },
        carrierReview: { select: { rating: true, comment: true, onTime: true } },
      },
    }),
    db.trip.count({ where }),
    db.trip.count({ where: { orgId: s.orgId, status: { in: ACTIVE } } }),
    db.trip.count({ where: { orgId: s.orgId, status: { in: DONE } } }),
    db.trip.aggregate({ where: { orgId: s.orgId, status: "COMPLETED" }, _count: { _all: true }, _sum: { revenueUsd: true, loadedKm: true } }),
    db.carrierReview.aggregate({ where: { carrierOrgId: s.orgId }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const nDone = done._count._all;
  const nRated = rating._count._all;
  const href = (tabKey: string, p = 1) => `/app/my-routes?tab=${tabKey}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("mr.title")} subtitle={t("mr.subtitle")} actions={<LinkButton href="/app/loads" variant="outline">{t("mr.goBoard")}</LinkButton>} />

      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5 sm:p-5">
        <Stat label={t("mr.sumActive")} value={nActive} />
        <Stat label={t("mr.sumDone")} value={nDone} />
        <Stat label={t("mr.sumRevenue")} value={usd(done._sum.revenueUsd ?? 0)} />
        <Stat label={t("mr.sumKm")} value={km(done._sum.loadedKm ?? 0)} />
        <div>
          <div className="text-xs text-muted">{t("rv.sumAbout")}</div>
          {nRated > 0 && rating._avg.rating != null ? (
            <div className="mt-1 text-sm">
              <Stars rating={Math.round(rating._avg.rating)} />
              <div className="num mt-0.5 font-semibold">{t("rv.sumValue", { avg: num(Math.round(rating._avg.rating * 10) / 10), n: nRated, reviews: nRated === 1 ? t("rv.review1") : t("rv.reviewN") })}</div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted">{t("rv.sumNone")}</div>
          )}
        </div>
      </Card>

      <div role="tablist" aria-label={t("mr.title")} className="inline-flex rounded-xl border border-border bg-surface p-1 text-[15px]">
        {(["active", "history"] as const).map((k) => (
          <Link key={k} href={href(k)} role="tab" aria-selected={tab === k}
            className={cn("rounded-lg px-4 py-2 font-medium transition-colors", tab === k ? "bg-brand text-brand-fg" : "text-muted hover:text-fg")}>
            {k === "active" ? t("mr.tabActive") : t("mr.tabHistory")}
            <span className="num ml-1.5 opacity-80">{k === "active" ? nActive : nHistory}</span>
          </Link>
        ))}
      </div>

      {trips.length === 0 ? (
        <Card>
          <EmptyState icon={<RouteIcon className="h-5 w-5" />} title={tab === "active" ? t("mr.emptyActive") : t("mr.emptyHistory")} actions={<LinkButton href="/app/loads">{t("mr.goBoard")}</LinkButton>} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {trips.map((tr) => {
            const profit = tr.revenueUsd - tr.costUsd;
            return (
              <li key={tr.id} className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <RouteLabel origin={tr.originCityId} dest={tr.destCityId} />
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {t("mr.truck", { truck: tr.truck.code })}</span>
                      {tr.offer?.broker?.name && <span>{t("mr.shipper", { name: tr.offer.broker.name })}</span>}
                      <span>
                        {tr.status === "COMPLETED" && tr.completedAt
                          ? t("mr.delivered", { when: dateTime(tr.completedAt) })
                          : tr.status === "IN_TRANSIT" && tr.etaAt
                            ? t("mr.arrives", { when: dateTime(tr.etaAt) })
                            : t("mr.started", { when: dateTime(tr.startedAt) })}
                      </span>
                    </div>
                  </div>
                  <Badge tone={TONE[tr.status] ?? "neutral"}>{t(`mr.status.${tr.status as "PLANNED" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED"}`)}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 text-sm">
                  <div className="flex gap-6">
                    <div><div className="text-xs text-muted">{t("mr.revenue")}</div><div className="num font-semibold">{usd(tr.revenueUsd)}</div></div>
                    <div><div className="text-xs text-muted">{t("mr.profit")}</div><div className={cn("num font-semibold", profit >= 0 ? "text-pos" : "text-neg")}>{usd(profit)}</div></div>
                    <div><div className="text-xs text-muted">&nbsp;</div><div className="num text-muted">{t("mr.kmLine", { loaded: km(tr.loadedKm), empty: km(tr.emptyKm) })}</div></div>
                  </div>
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <Link href={`/app/fleet/${tr.truck.id}`} className="text-brand hover:underline">{t("mr.openTruck")}</Link>
                    {tr.offerId && <Link href={`/app/loads/${tr.offerId}`} className="text-brand hover:underline">{t("mr.openLoad")}</Link>}
                  </div>
                </div>

                {tr.status === "COMPLETED" && (
                  <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("mr.shipperReview")}</div>
                      {tr.carrierReview ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Stars rating={tr.carrierReview.rating} />
                            {tr.carrierReview.onTime === true && <Badge tone="pos">{t("rv.onTime")}</Badge>}
                            {tr.carrierReview.onTime === false && <Badge tone="warn">{t("rv.notOnTime")}</Badge>}
                          </div>
                          {tr.carrierReview.comment && <p className="whitespace-pre-line">“{tr.carrierReview.comment}”</p>}
                        </div>
                      ) : (
                        <p className="mt-1 text-muted">{t("mr.noShipperReview")}</p>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("mr.yourReview")}</div>
                      {tr.review ? (
                        <p className="mt-1 inline-flex items-center gap-1.5 text-pos"><CheckCircle2 className="h-4 w-4" /> {t("mr.reviewedYes")}</p>
                      ) : tr.offer?.broker?.name ? (
                        <p className="mt-1 text-muted">{t("mr.notReviewed")} · <Link href={`/app/fleet/${tr.truck.id}?delivered=${tr.id}`} className="font-medium text-brand hover:underline">{t("mr.reviewNow")}</Link></p>
                      ) : (
                        <p className="mt-1 text-muted">—</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("catalog.pagination")}>
          <span className="text-muted">{t("catalog.pageOf", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && <LinkButton variant="outline" size="sm" href={href(tab, page - 1)}>{t("catalog.previous")}</LinkButton>}
            {page < pages && <LinkButton variant="outline" size="sm" href={href(tab, page + 1)}>{t("catalog.next")}</LinkButton>}
          </div>
        </nav>
      )}
    </div>
  );
}
