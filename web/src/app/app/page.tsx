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
import { cityLabel, RouteLabel } from "@/components/loads/parts";
import { cn, dateTime, pct, perKm, relativeDay, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const DEMAND_TONE: Record<string, string> = { VERY_HIGH: "text-pos", HIGH: "text-pos", MEDIUM: "text-brand", LOW: "text-warn", INSUFFICIENT: "text-subtle" };

export default async function Dashboard() {
  const s = await requireSession();
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
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const st = fleet.stats30d;

  if (fleet.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="Add your first truck to get recommendations"
          body="Karvon ranks freight for your specific trucks — their body type, capacity, location and costs."
          actions={<LinkButton href="/app/fleet/new">Add truck</LinkButton>}
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting}, {s.user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted">{dateTime(new Date())} · Tashkent time</p>
        </div>
        <LinkButton href="/app/loads" variant="outline" size="sm">
          Open load board <ArrowRight className="h-4 w-4" />
        </LinkButton>
      </div>

      {/* Snapshot */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Your fleet</h2>
            <Link href="/app/fleet" className="text-xs text-brand hover:underline">Manage</Link>
          </div>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{fleet.total} <span className="text-base font-normal text-muted">trucks</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><span className="num font-semibold text-pos">{fleet.available}</span> <span className="text-muted">available</span></div>
            <div><span className="num font-semibold text-info">{fleet.onRoute}</span> <span className="text-muted">on route</span></div>
            <div><span className="num font-semibold text-warn">{fleet.maintenance}</span> <span className="text-muted">service</span></div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Today&apos;s opportunities</h2>
            {market.isDemo && <DemoBadge />}
          </div>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{opp.fresh} <span className="text-base font-normal text-muted">new loads (24 h)</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Link href="/app/loads?minScore=55" className="hover:underline"><span className="num font-semibold text-brand">{opp.matching}</span> <span className="text-muted">match your fleet</span></Link>
            <Link href="/app/loads?minScore=80" className="hover:underline"><span className="num font-semibold text-pos">{opp.strong}</span> <span className="text-muted">highly recommended</span></Link>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Market · 7 days</h2>
            <Link href="/app/analytics" className="text-xs text-brand hover:underline">Details</Link>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-3xl font-semibold tracking-tight">{market.avgPerKm ? perKm(market.avgPerKm) : "—"}</span>
            <Trend value={market.trendPct} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted">Demand </span><span className={cn("font-semibold", DEMAND_TONE[market.demand])}>{market.demand.replace("_", " ").replace("INSUFFICIENT", "N/A")}</span></div>
            <div><span className="text-muted">Loads/wk </span><Trend value={market.loadsTrendPct} /></div>
          </div>
        </Card>
      </div>

      {/* AI recommendations */}
      {recs.length ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <TopMatch rec={recs[0]} />
          <Card className="overflow-hidden">
            <CardHeader title="More recommendations" action={<Link href="/app/loads?sort=score" className="text-xs text-brand hover:underline">See all</Link>} />
            <div className="divide-y divide-border">
              {recs.slice(1).map((r) => <RecRow key={`${r.truck.id}${r.offer.id}`} rec={r} />)}
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<PackageSearch className="h-5 w-5" />}
            title="No loads match your available trucks right now"
            body="Try loosening your preferences: expand the deadhead radius, lower the minimum rate, or add destinations."
            actions={<><LinkButton href="/app/settings" variant="outline">Edit preferences</LinkButton><LinkButton href="/app/loads">Browse all loads</LinkButton></>}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Backhaul */}
        <Card className="overflow-hidden">
          <CardHeader title="Return loads" subtitle="Found before your trucks arrive" action={<Repeat className="h-4 w-4 text-subtle" />} />
          {backhaul.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">No trucks on a trip right now. When a truck is assigned a load, we start looking for its return load automatically.</p>
          ) : (
            <div className="divide-y divide-border">
              {backhaul.map((p) => {
                const best = p.options[0];
                return (
                  <div key={p.truck.id} className="px-4 py-3.5 sm:px-5">
                    <div className="text-sm">
                      <Link href={`/app/fleet/${p.truck.id}`} className="font-semibold hover:underline">{p.truck.code}</Link>
                      <span className="text-muted"> arrives in {cityLabel(p.arrivalCityId)} ~{dateTime(p.arrivalAt)} · {p.totalFound} return option{p.totalFound === 1 ? "" : "s"}</span>
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
                      <p className="mt-1 text-xs text-muted">No eligible return loads yet — we&apos;ll keep checking as sources sync.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* KPIs */}
        <Card>
          <CardHeader title="Performance · last 30 days" action={st.isDemo ? <DemoBadge /> : undefined} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 pb-5 sm:grid-cols-3 sm:px-5">
            <Stat label="Truck utilization" value={pct(st.utilization)} sub="loaded km / total km" tone="brand" />
            <Stat label="Empty km" value={st.emptyKm.toLocaleString("en-US")} sub={`of ${(st.loadedKm + st.emptyKm).toLocaleString("en-US")} km`} />
            <Stat label="Profit / km" value={st.profitPerKm == null ? "—" : `$${st.profitPerKm.toFixed(2)}`} tone={st.profitPerKm && st.profitPerKm > 0 ? "pos" : undefined} />
            <Stat label="Trips completed" value={st.trips} />
            <Stat label="Revenue" value={usd(st.revenue)} />
            <Stat
              label="Recs accepted"
              value={fleet.acceptance.shown ? `${fleet.acceptance.accepted}/${fleet.acceptance.shown}` : "—"}
              sub="recommended loads you took"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

async function BrokerDashboard({ orgId, orgName, userName }: { orgId: string; orgName: string; userName: string }) {
  const listings = await db.freightListing.findMany({
    where: { sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${orgId}-` } },
    include: { offer: true },
    orderBy: { firstSeenAt: "desc" },
    take: 10,
  });
  const active = listings.filter((l) => l.offer.status === "ACTIVE").length;
  const booked = listings.filter((l) => l.offer.status === "BOOKED").length;
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Tashkent" }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greeting}, {userName.split(" ")[0]}</h1>
          <p className="text-sm text-muted">{dateTime(new Date())} · Tashkent time · posting as {orgName}</p>
        </div>
        <LinkButton href="/app/post">
          <PackagePlus className="h-4 w-4" /> Post a load
        </LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Active loads</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{active}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Covered</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{booked}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Total posted</h2>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">{listings.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Your recent loads" action={<Link href="/app/post" className="text-xs text-brand hover:underline">Manage</Link>} />
        {listings.length === 0 ? (
          <EmptyState
            icon={<PackagePlus className="h-5 w-5" />}
            title="Post your first load"
            body="Loads you post appear in the public catalog and are matched to carriers' trucks automatically."
            actions={<LinkButton href="/app/post">Post a load</LinkButton>}
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <Link href={`/load/${l.offerId}`} className="min-w-0 hover:underline">
                  <RouteLabel origin={l.offer.originCityId} dest={l.offer.destCityId} size="sm" />
                  <div className="text-xs text-muted">{relativeDay(l.offer.loadingDate)} · {l.offer.rateUsd > 0 ? usd(l.offer.rateUsd) : "negotiable"}</div>
                </Link>
                <span className={cn("text-xs font-medium", l.offer.status === "ACTIVE" ? "text-pos" : l.offer.status === "BOOKED" ? "text-brand" : "text-subtle")}>
                  {l.offer.status === "ACTIVE" ? "Active" : l.offer.status === "BOOKED" ? "Covered" : "Expired"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
