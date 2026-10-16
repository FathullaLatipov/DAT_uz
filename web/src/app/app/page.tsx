import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { ArrowRight, PackageSearch, PackagePlus, Repeat, Truck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { fleetSummary } from "@/server/services/fleet";
import { opportunityCounts, recommendations } from "@/server/services/freight";
import { marketSummary } from "@/server/services/market";
import { fleetBackhaul } from "@/server/services/backhaul";
import { checkSavedSearches } from "@/server/services/alerts";
import { jobsEnabled } from "@/server/jobs/config";
import { Card, CardHeader, DemoBadge, EmptyState, LinkButton, Stat, Trend } from "@/components/ui/primitives";
import { RecRow, TopMatch } from "@/components/loads/recommendation";
import { RouteLabel } from "@/components/loads/parts";
import { getI18n } from "@/i18n/server";
import { cn, pct } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.dashboard") };
}

const DEMAND_TONE: Record<string, string> = { VERY_HIGH: "text-pos", HIGH: "text-pos", MEDIUM: "text-brand", LOW: "text-warn", INSUFFICIENT: "text-subtle" };

export default async function Dashboard() {
  const s = await requireSession();
  const { t, tn, m, num, city, dateTime, perKm, usd } = await getI18n();
  if (s.role === "BROKER") return <BrokerDashboard orgId={s.orgId} orgName={s.org.name} userName={s.user.name} />;
  const [fleet, opp, market, recs, backhaul] = await Promise.all([
    fleetSummary(s.orgId),
    opportunityCounts(s.orgId),
    marketSummary(),
    recommendations(s.orgId, 6),
    fleetBackhaul(s.orgId),
  ]);
  // Both deferred via `after()`, not awaited: neither affects what's rendered (alerts land as
  // notifications, "SHOWN" rows are write-only analytics for the acceptance-rate KPI), and the
  // saved-search check in particular re-runs the full load-board query per saved search (joins
  // + in-memory ranking) — too heavy for the critical path of every dashboard render. `after()`
  // (not a bare fire-and-forget) keeps the serverless function alive until these finish even
  // though the response has already been sent — a plain un-awaited promise can get cut off
  // mid-flight on Vercel once the response completes. (The saved-search check running on every
  // dashboard visit is still a stopgap per the original comment; a real scheduler is the proper
  // fix, tracked in the README.)
  after(async () => {
    // With the scheduler on, the `saved-search-alerts` job checks everyone's searches on a timer.
    if (!jobsEnabled()) await checkSavedSearches(s.userId, s.orgId).catch((e) => console.error("[alerts]", e));
    if (recs.length) {
      const since = new Date(Date.now() - 86_400_000);
      const existing = await db.recommendation.findMany({ where: { orgId: s.orgId, createdAt: { gte: since } }, select: { truckId: true, offerId: true } });
      const seen = new Set(existing.map((e) => `${e.truckId}:${e.offerId}`));
      const fresh = recs.filter((r) => !seen.has(`${r.truck.id}:${r.offer.id}`));
      if (fresh.length) await db.recommendation.createMany({ data: fresh.map((r) => ({ orgId: s.orgId, truckId: r.truck.id, offerId: r.offer.id, score: r.match.score, action: "SHOWN" })) });
    }
  });

  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Tashkent" }));
  const greeting = hour < 12 ? t("dash.morning", { name: s.user.name.split(" ")[0] }) : hour < 18 ? t("dash.afternoon", { name: s.user.name.split(" ")[0] }) : t("dash.evening", { name: s.user.name.split(" ")[0] });
  const st = fleet.stats30d;

  if (fleet.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title={t("dash.firstTruckTitle")}
          body={t("dash.firstTruckBody")}
          actions={<LinkButton href="/app/fleet/new">{t("dash.addTruck")}</LinkButton>}
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting}
          </h1>
          <p className="text-sm text-muted">{t("dash.timeLine", { when: dateTime(new Date()) })}</p>
        </div>
        <LinkButton href="/app/loads" variant="outline" size="sm">
          {t("saved.openBoard")} <ArrowRight className="h-4 w-4" />
        </LinkButton>
      </div>

      {/* Snapshot */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("dash.yourFleet")}</h2>
            <Link href="/app/fleet" className="text-xs text-brand hover:underline">{t("dash.manage")}</Link>
          </div>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{fleet.total} <span className="text-base font-normal text-muted">{tn("dash.trucksWord", fleet.total)}</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><span className="num font-semibold text-pos">{fleet.available}</span> <span className="text-muted">{t("dash.available")}</span></div>
            <div><span className="num font-semibold text-info">{fleet.onRoute}</span> <span className="text-muted">{t("dash.onRoute")}</span></div>
            <div><span className="num font-semibold text-warn">{fleet.maintenance}</span> <span className="text-muted">{t("dash.service")}</span></div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("dash.opportunities")}</h2>
            {market.isDemo && <DemoBadge />}
          </div>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{opp.fresh} <span className="text-base font-normal text-muted">{t("dash.newLoads")}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Link href="/app/loads?minScore=55" className="hover:underline"><span className="num font-semibold text-brand">{opp.matching}</span> <span className="text-muted">{t("dash.matchFleet")}</span></Link>
            <Link href="/app/loads?minScore=80" className="hover:underline"><span className="num font-semibold text-pos">{opp.strong}</span> <span className="text-muted">{t("dash.highlyRecommended")}</span></Link>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("dash.market7")}</h2>
            <Link href="/app/analytics" className="text-xs text-brand hover:underline">{t("dash.details")}</Link>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-3xl font-semibold tracking-tight">{market.avgPerKm ? perKm(market.avgPerKm) : "—"}</span>
            <Trend value={market.trendPct} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted">{t("dash.demand")} </span><span className={cn("font-semibold", DEMAND_TONE[market.demand])}>{m.dash.demandLevels[market.demand] ?? market.demand}</span></div>
            <div><span className="text-muted">{t("dash.loadsWeek")} </span><Trend value={market.loadsTrendPct} /></div>
          </div>
        </Card>
      </div>

      {/* AI recommendations */}
      {recs.length ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <TopMatch rec={recs[0]} />
          <Card className="overflow-hidden">
            <CardHeader title={t("dash.moreRecs")} action={<Link href="/app/loads?sort=score" className="text-xs text-brand hover:underline">{t("dash.seeAll")}</Link>} />
            <div className="divide-y divide-border">
              {recs.slice(1).map((r) => <RecRow key={`${r.truck.id}${r.offer.id}`} rec={r} />)}
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<PackageSearch className="h-5 w-5" />}
            title={t("dash.noRecsTitle")}
            body={t("dash.noRecsBody")}
            actions={<><LinkButton href="/app/settings" variant="outline">{t("dash.editPrefs")}</LinkButton><LinkButton href="/app/loads">{t("dash.browseAll")}</LinkButton></>}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Backhaul */}
        <Card className="overflow-hidden">
          <CardHeader title={t("dash.returnLoads")} subtitle={t("dash.returnSub")} action={<Repeat className="h-4 w-4 text-subtle" />} />
          {backhaul.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">{t("dash.noTrips")}</p>
          ) : (
            <div className="divide-y divide-border">
              {backhaul.map((p) => {
                const best = p.options[0];
                return (
                  <div key={p.truck.id} className="px-4 py-3.5 sm:px-5">
                    <div className="text-sm">
                      <Link href={`/app/fleet/${p.truck.id}`} className="font-semibold hover:underline">{p.truck.code}</Link>
                      <span className="text-muted"> {t("dash.arrivesIn", { city: city(p.arrivalCityId), when: dateTime(p.arrivalAt) })} · {tn("dash.returnOptions", p.totalFound)}</span>
                    </div>
                    {best ? (
                      <Link href={`/app/loads/${best.offer.id}?truck=${p.truck.id}`} className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5 hover:bg-surface-3">
                        <RouteLabel origin={best.offer.originCityId} dest={best.offer.destCityId} size="sm" />
                        <span className="num shrink-0 text-right text-sm">
                          <span className="font-semibold">{usd(best.offer.rateUsd)}</span>
                          <span className="ml-2 text-pos">{usd(best.match.profit.profit)}</span>
                          <span className="ml-2 text-muted">{best.match.score}%</span>
                        </span>
                      </Link>
                    ) : (
                      <p className="mt-1 text-xs text-muted">{t("notify.none")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* KPIs */}
        <Card>
          <CardHeader title={t("dash.performance")} action={st.isDemo ? <DemoBadge /> : undefined} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 pb-5 sm:grid-cols-3 sm:px-5">
            <Stat label={t("dash.utilization")} value={pct(st.utilization)} sub={t("dash.utilizationSub")} tone="brand" />
            <Stat label={t("dash.emptyKm")} value={num(st.emptyKm)} sub={t("dash.ofKm", { n: num(st.loadedKm + st.emptyKm) })} />
            <Stat label={t("calc.profitPerKm")} value={st.profitPerKm == null ? "—" : usd(st.profitPerKm, 2)} tone={st.profitPerKm && st.profitPerKm > 0 ? "pos" : undefined} />
            <Stat label={t("dash.tripsDone")} value={st.trips} />
            <Stat label={t("calc.revenue")} value={usd(st.revenue)} />
            <Stat
              label={t("dash.recsAccepted")}
              value={fleet.acceptance.shown ? `${fleet.acceptance.accepted}/${fleet.acceptance.shown}` : "—"}
              sub={t("dash.recsAcceptedSub")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

async function BrokerDashboard({ orgId, orgName, userName }: { orgId: string; orgName: string; userName: string }) {
  const { t, label, dateTime, relativeDay, usd } = await getI18n();
  const listings = await db.freightListing.findMany({
    where: { sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${orgId}-` } },
    include: { offer: true },
    orderBy: { firstSeenAt: "desc" },
    take: 10,
  });
  const active = listings.filter((l) => l.offer.status === "ACTIVE").length;
  const booked = listings.filter((l) => l.offer.status === "BOOKED").length;
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Tashkent" }));
  const first = userName.split(" ")[0];
  const greeting = hour < 12 ? t("dash.morning", { name: first }) : hour < 18 ? t("dash.afternoon", { name: first }) : t("dash.evening", { name: first });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greeting}</h1>
          <p className="text-sm text-muted">{t("dash.brokerTimeLine", { when: dateTime(new Date()), org: orgName })}</p>
        </div>
        <LinkButton href="/app/post">
          <PackagePlus className="h-4 w-4" /> {t("nav.postLoad")}
        </LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("dash.activeLoads")}</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{active}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("post.covered")}</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{booked}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t("dash.totalPosted")}</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{listings.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={t("dash.recentLoads")} action={<Link href="/app/post" className="text-xs text-brand hover:underline">{t("dash.manage")}</Link>} />
        {listings.length === 0 ? (
          <EmptyState
            icon={<PackagePlus className="h-5 w-5" />}
            title={t("dash.firstLoadTitle")}
            body={t("dash.firstLoadBody")}
            actions={<LinkButton href="/app/post">{t("nav.postLoad")}</LinkButton>}
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <Link href={`/load/${l.offerId}`} className="min-w-0 hover:underline">
                  <RouteLabel origin={l.offer.originCityId} dest={l.offer.destCityId} size="sm" />
                  <div className="text-xs text-muted">{relativeDay(l.offer.loadingDate)} · {l.offer.rateUsd > 0 ? usd(l.offer.rateUsd) : t("tile.rateNegotiable").toLowerCase()}</div>
                </Link>
                <span className={cn("text-xs font-medium", l.offer.status === "ACTIVE" ? "text-pos" : l.offer.status === "BOOKED" ? "text-brand" : "text-subtle")}>
                  {l.offer.status === "BOOKED" ? t("post.covered") : label(l.offer.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
