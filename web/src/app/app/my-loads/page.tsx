import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, PackagePlus, Phone, Mail, Star, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { brokerKey } from "@/server/ingestion/normalize";
import { getI18n } from "@/i18n/server";
import { CloseLoadButton } from "@/components/loads/close-load-button";
import { TripTrackPanel } from "@/components/fleet/trip-track-panel";
import { PaymentBox } from "@/components/fleet/payment-box";
import { paymentDueAt } from "@/server/services/payment-rules";
import { loadTrack } from "@/server/services/tracking-data";
import { RouteLabel } from "@/components/loads/parts";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ml.title") };
}

type Stage = "active" | "taken" | "onroad" | "delivered" | "expired" | "closed";
const TONE: Record<Stage, "pos" | "info" | "warn" | "neutral"> = { active: "pos", taken: "info", onroad: "info", delivered: "neutral", expired: "warn", closed: "neutral" };

/** Where a posted load is, from the load's own state and its latest trip that was not cancelled. */
function stageOf(status: string, trip: { status: string } | undefined): Stage {
  if (status === "ACTIVE") return "active";
  if (trip?.status === "COMPLETED") return "delivered";
  if (trip?.status === "IN_TRANSIT") return "onroad";
  if (trip) return "taken";
  return status === "BOOKED" ? "closed" : "expired";
}

const PAGE_SIZE = 20;
const STAGES = ["active", "onroad", "delivered"] as const;
type StageFilter = (typeof STAGES)[number];

/** Five stars, `rating` of them filled. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= rating ? "h-4 w-4 fill-warn text-warn" : "h-4 w-4 text-border"} />)}
    </span>
  );
}

/** Average of the carriers' reviews of this company, or null when it has none. */
async function companyRating(key: string | null): Promise<{ avg: number; n: number } | null> {
  if (!key) return null;
  const b = await db.broker.findUnique({ where: { normalizedName: key }, select: { id: true } });
  if (!b) return null;
  const [n, agg] = await Promise.all([db.brokerReview.count({ where: { brokerId: b.id } }), db.brokerReview.aggregate({ where: { brokerId: b.id }, _avg: { rating: true } })]);
  const avg = agg._avg.rating;
  return n > 0 && avg != null ? { avg, n } : null;
}

export default async function MyLoadsPage({ searchParams }: { searchParams: Promise<{ page?: string; stage?: string }> }) {
  const s = await requireSession();
  const { t, ago, dateTime, relativeDay, usd, km, num } = await getI18n();
  const { page: pageParam, stage: stageParam } = await searchParams;
  const stageFilter = (STAGES as readonly string[]).includes(stageParam ?? "") ? (stageParam as StageFilter) : null;
  const page = Math.max(1, Number(pageParam) || 1);
  const ownListing = { sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${s.orgId}-` } };
  // The group the person picked (waiting / on the road / delivered); loads are told apart by the load's own state and its trips.
  const inStage = {
    active: { status: "ACTIVE" },
    onroad: { trips: { some: { status: "IN_TRANSIT" } } },
    delivered: { trips: { some: { status: "COMPLETED" } } },
  } as const;
  const where = { ...ownListing, ...(stageFilter ? { offer: inStage[stageFilter] } : {}) };
  const ownOffers = { listings: { some: ownListing } };
  const key = brokerKey(s.org.name);
  const [listings, total, counts, rating] = await Promise.all([
    db.freightListing.findMany({
      where,
      distinct: ["offerId"],
      orderBy: { firstSeenAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        firstSeenAt: true,
        offer: {
          select: {
            id: true, originCityId: true, destCityId: true, loadingDate: true, rateUsd: true, status: true, paymentTerms: true,
            trips: {
              where: { status: { not: "CANCELLED" } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true, status: true, etaAt: true, startedAt: true, completedAt: true, revenueUsd: true, paymentStatus: true, paidAt: true, loadedKm: true,
                review: { select: { rating: true, comment: true, paidOnTime: true, disputed: true, cancelled: true, createdAt: true } },
                truck: { select: { code: true } },
                org: { select: { name: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { name: true, email: true } } } } } },
              },
            },
          },
        },
      },
    }),
    db.freightListing.count({ where }),
    // The summary strip counts offers (a load posted twice is one), over everything this company posted.
    Promise.all([
      db.freightOffer.count({ where: ownOffers }),
      db.freightOffer.count({ where: { ...ownOffers, status: "ACTIVE" } }),
      db.freightOffer.count({ where: { ...ownOffers, trips: { some: { status: "IN_TRANSIT" } } } }),
      db.freightOffer.count({ where: { ...ownOffers, trips: { some: { status: "COMPLETED" } } } }),
    ]),
    // What carriers think of working with this company (reviews are written about the company's broker identity).
    companyRating(key),
  ]);
  const [nPosted, nOpen, nRoad, nDelivered] = counts;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // `distinct: ["offerId"]` above already collapses a load posted twice into one row.
  const rows = listings;
  // Where each load on the road is (what the carrier shares: position, progress, ETA; never its costs).
  const tracks = new Map<string, Awaited<ReturnType<typeof loadTrack>>>();
  for (const r of rows.filter((x) => x.offer.trips[0]?.status === "IN_TRANSIT").slice(0, 10)) tracks.set(r.offer.id, await loadTrack(r.offer.trips[0].id, s.orgId));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("ml.title")} subtitle={t("ml.subtitle")} actions={<LinkButton href="/app/post"><PackagePlus className="h-4 w-4" /> {t("ml.post")}</LinkButton>} />
      {nPosted > 0 && (
        <>
          <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5 sm:p-5">
            <Stat label={t("ml.sumPosted")} value={nPosted} />
            <Stat label={t("ml.sumOpen")} value={nOpen} />
            <Stat label={t("ml.sumRoad")} value={nRoad} />
            <Stat label={t("ml.sumDelivered")} value={nDelivered} />
            <div>
              <div className="text-xs text-muted">{t("ml.sumRating")}</div>
              {rating ? (
                <div className="mt-1 text-sm">
                  <Stars rating={Math.round(rating.avg)} />
                  <div className="num mt-0.5 font-semibold">{t("ml.sumRatingValue", { avg: num(Math.round(rating.avg * 10) / 10), n: rating.n, reviews: rating.n === 1 ? t("ml.review1") : t("ml.reviewN") })}</div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-muted">{t("ml.sumNoRating")}</div>
              )}
            </div>
          </Card>
          <nav className="flex flex-wrap gap-1.5 text-sm" aria-label={t("ml.title")}>
            {([[null, t("ml.filterAll"), nPosted], ["active", t("ml.sumOpen"), nOpen], ["onroad", t("ml.sumRoad"), nRoad], ["delivered", t("ml.sumDelivered"), nDelivered]] as const).map(([k, text, n]) => (
              <Link key={k ?? "all"} href={k ? `/app/my-loads?stage=${k}` : "/app/my-loads"} aria-current={stageFilter === k ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 font-medium transition-colors", stageFilter === k ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-fg")}>
                {text} <span className="num opacity-80">{n}</span>
              </Link>
            ))}
          </nav>
        </>
      )}
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<PackagePlus className="h-5 w-5" />} title={stageFilter ? t("ml.noneInFilter") : t("ml.empty")} body={stageFilter ? undefined : `${t("dash.firstLoadBody")} ${t("ml.emptyHint")}`} actions={stageFilter ? undefined : <LinkButton href="/app/post">{t("ml.post")}</LinkButton>} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ offer: o, firstSeenAt }) => {
            const trip = o.trips[0];
            const stage = stageOf(o.status, trip);
            const contact = trip?.org.memberships[0]?.user;
            return (
              <li key={o.id} id={`load-${o.id}`} className="scroll-mt-20 rounded-xl border border-border bg-surface p-4 shadow-card target:border-brand target:ring-2 target:ring-brand/30 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/loads/${o.id}`} className="hover:underline"><RouteLabel origin={o.originCityId} dest={o.destCityId} /></Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {relativeDay(o.loadingDate)} · {o.rateUsd > 0 ? usd(o.rateUsd) : t("tile.rateNegotiable").toLowerCase()} · {t("ml.posted", { ago: ago(firstSeenAt) })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TONE[stage]}>{t(`ml.status.${stage}`)}</Badge>
                    {stage === "active" && <CloseLoadButton id={o.id} />}
                  </div>
                </div>

                {trip ? (
                  <div className="mt-3 grid gap-2 rounded-lg bg-surface-2/60 px-3 py-2.5 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="font-medium">{trip.org.name}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {t("ml.truck", { truck: trip.truck.code })}</span>
                        {trip.etaAt && stage !== "delivered" && <span>{t("ml.arrives", { when: dateTime(trip.etaAt) })}</span>}
                        {contact && <span>{t("ml.contact")}: {contact.name}</span>}
                      </div>
                    </div>
                    {contact && (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                        <Mail className="h-4 w-4" /> {contact.email}
                      </a>
                    )}
                  </div>
                ) : (
                  stage === "active" && <p className="mt-3 text-xs text-muted"><Phone className="mr-1 inline h-3.5 w-3.5" />{t("ml.noCarrier")}</p>
                )}

                {stage === "delivered" && trip && (
                  <div className="mt-3 rounded-lg border border-pos/30 bg-pos-soft/40 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-pos">
                      <CheckCircle2 className="h-4 w-4" /> {t("ml.deliveredAt", { when: trip.completedAt ? dateTime(trip.completedAt) : "—" })}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{t("ml.deliveredKm", { km: km(trip.loadedKm) })}</div>
                    <div className="mt-3 border-t border-pos/20 pt-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("ml.reviewTitle")}</div>
                      {trip.review ? (
                        <div className="mt-1.5 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Stars rating={trip.review.rating} />
                            {trip.review.paidOnTime === true && <Badge tone="pos">{t("ml.reviewPaid")}</Badge>}
                            {trip.review.paidOnTime === false && <Badge tone="warn">{t("ml.reviewLate")}</Badge>}
                            {trip.review.disputed && <Badge tone="warn">{t("ml.reviewDisputed")}</Badge>}
                            {trip.review.cancelled && <Badge tone="neg">{t("ml.reviewCancelled")}</Badge>}
                            <span className="text-xs text-subtle">{t("ml.reviewOn", { when: dateTime(trip.review.createdAt) })}</span>
                          </div>
                          {trip.review.comment && <p className="whitespace-pre-line text-sm">“{trip.review.comment}”</p>}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-muted">{t("ml.reviewNone")}</p>
                      )}
                    </div>
                  </div>
                )}

                {trip && (
                  <div className="mt-3 border-t border-border pt-3">
                    <PaymentBox
                      role="shipper"
                      p={{
                        tripId: trip.id, status: trip.paymentStatus, tripStatus: trip.status, amountUsd: trip.revenueUsd,
                        dueAt: paymentDueAt(o.paymentTerms, trip)?.toISOString() ?? null,
                        paidAt: trip.paidAt?.toISOString() ?? null,
                      }}
                    />
                  </div>
                )}

                {tracks.get(o.id) && trip && (
                  <div className="mt-3">
                    <TripTrackPanel initial={tracks.get(o.id)!} tripId={trip.id} compactMap />
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
            {page > 1 && <LinkButton variant="outline" size="sm" href={`/app/my-loads?page=${page - 1}`}>{t("catalog.previous")}</LinkButton>}
            {page < pages && <LinkButton variant="outline" size="sm" href={`/app/my-loads?page=${page + 1}`}>{t("catalog.next")}</LinkButton>}
          </div>
        </nav>
      )}
    </div>
  );
}
