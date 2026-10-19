import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus, Phone, Mail, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { getI18n } from "@/i18n/server";
import { CloseLoadButton } from "@/components/loads/close-load-button";
import { TripTrackPanel } from "@/components/fleet/trip-track-panel";
import { PaymentBox } from "@/components/fleet/payment-box";
import { paymentDueAt } from "@/server/services/payment-rules";
import { loadTrack } from "@/server/services/tracking-data";
import { RouteLabel } from "@/components/loads/parts";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";

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

export default async function MyLoadsPage() {
  const s = await requireSession();
  const { t, ago, dateTime, relativeDay, usd } = await getI18n();
  const listings = await db.freightListing.findMany({
    where: { sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${s.orgId}-` } },
    orderBy: { firstSeenAt: "desc" },
    take: 100,
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
              id: true, status: true, etaAt: true, startedAt: true, completedAt: true, revenueUsd: true, paymentStatus: true, paidAt: true,
              truck: { select: { code: true } },
              org: { select: { name: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { name: true, email: true } } } } } },
            },
          },
        },
      },
    },
  });
  // A load posted twice is one offer; show it once.
  const seen = new Set<string>();
  const rows = listings.filter((l) => (seen.has(l.offer.id) ? false : (seen.add(l.offer.id), true)));
  // Where each load on the road is (what the carrier shares: position, progress, ETA; never its costs).
  const tracks = new Map<string, Awaited<ReturnType<typeof loadTrack>>>();
  for (const r of rows.filter((x) => x.offer.trips[0]?.status === "IN_TRANSIT").slice(0, 10)) tracks.set(r.offer.id, await loadTrack(r.offer.trips[0].id, s.orgId));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("ml.title")} subtitle={t("ml.subtitle")} actions={<LinkButton href="/app/post"><PackagePlus className="h-4 w-4" /> {t("ml.post")}</LinkButton>} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<PackagePlus className="h-5 w-5" />} title={t("ml.empty")} body={t("dash.firstLoadBody")} actions={<LinkButton href="/app/post">{t("ml.post")}</LinkButton>} />
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
    </div>
  );
}
