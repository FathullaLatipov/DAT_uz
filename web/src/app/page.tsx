import Link from "next/link";
import { ArrowRight, Plus, Truck } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { catalogOverview, latestLoads } from "@/server/services/catalog";
import { autoSyncIfStale } from "@/server/ingestion/registry";
import { db } from "@/server/db";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { SearchBar } from "@/components/public/search-bar";
import { LoadTile } from "@/components/public/load-tile";
import { cityLabel, CountryTag, RouteLabel } from "@/components/loads/parts";
import { EmptyState, LinkButton } from "@/components/ui/primitives";
import { km, perKm, relativeDay, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  autoSyncIfStale(db); // refresh real sources in the background when stale
  const [session, overview, latest] = await Promise.all([getSession(), catalogOverview(), latestLoads(8)]);
  const { directions, popularRoutes, totals } = overview;

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!session} />
      {totals.demoShare > 0 && (
        <div className="border-b border-dashed border-accent/40 bg-warn-soft/60 px-4 py-1.5 text-center text-xs text-warn">
          {Math.round(totals.demoShare * 100)}% of listings are <strong>DEMO DATA</strong> until real sources are connected — they are labelled on every card.
        </div>
      )}

      {/* Hero + search */}
      <section className="relative border-b border-border">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,var(--brand-soft),transparent)]" />
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">Freight loads across Uzbekistan and beyond</h1>
          <p className="mt-3 max-w-2xl text-muted sm:text-lg">
            {totals.loads.toLocaleString("en-US")} active loads on {totals.routes} routes in {totals.countries} countries — one place, deduplicated, with the source of every listing.
          </p>
          <SearchBar className="mt-7" />
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {popularRoutes.slice(0, 6).map((r) => (
              <Link key={r.slug} href={`/routes/${r.slug}`} className="rounded-full border border-border bg-surface px-3 py-1 text-muted transition hover:border-brand hover:text-fg">
                <RouteLabel origin={r.origin} dest={r.dest} size="sm" className="font-medium" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {totals.loads === 0 ? (
          <div className="py-16">
            <EmptyState icon={<Truck className="h-5 w-5" />} title="No active loads yet" body="Be the first to post a load." actions={<LinkButton href="/app/post">Post a load</LinkButton>} />
          </div>
        ) : (
          <>
            {/* Directions = categories */}
            <section id="directions" className="scroll-mt-20 pt-10">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Directions</h2>
                <Link href="/catalog" className="text-sm text-brand hover:underline">All loads →</Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {directions.map((d) => (
                  <Link key={d.key} href={d.href} className="group flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-pop">
                    <div className="flex items-center justify-between">
                      <CountryTag code={d.country} />
                      <ArrowRight className="h-4 w-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />
                    </div>
                    <div className="mt-3 truncate font-semibold">{d.title}</div>
                    <div className="truncate text-xs text-muted">{d.subtitle}</div>
                    <div className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                      <span className="num font-semibold">{d.loads} <span className="font-normal text-muted">loads</span></span>
                      {d.minRateUsd != null && <span className="num text-xs text-muted">from {usd(d.minRateUsd)}</span>}
                    </div>
                    <div className="mt-2 truncate text-xs text-subtle">{d.routes.slice(0, 3).map((r) => `${cityLabel(r.origin)} → ${cityLabel(r.dest)}`).join(" · ")}</div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Popular routes */}
            <section className="pt-12">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Popular routes</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {popularRoutes.map((r) => (
                  <Link key={r.slug} href={`/routes/${r.slug}`} className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-border-strong hover:shadow-pop">
                    <div className="min-w-0 flex-1">
                      <RouteLabel origin={r.origin} dest={r.dest} size="sm" />
                      <div className="mt-1 text-xs text-muted">
                        {km(r.distanceKm)} · {r.loads} load{r.loads === 1 ? "" : "s"}{r.nextLoading && ` · next ${relativeDay(r.nextLoading).toLowerCase()}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted">from</div>
                      <div className="num font-semibold">{usd(r.minRateUsd)}</div>
                      {r.medianPerKm != null && <div className="num text-xs text-subtle">~{perKm(r.medianPerKm)}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Latest */}
            <section className="pt-12">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Just posted</h2>
                <Link href="/catalog?sort=newest" className="text-sm text-brand hover:underline">See all →</Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {latest.map((o) => <LoadTile key={o.id} o={o} />)}
              </div>
            </section>
          </>
        )}

        {/* Two audiences */}
        <section className="grid gap-4 pt-12 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <Truck className="h-6 w-6 text-brand" />
            <h3 className="mt-3 text-lg font-semibold">Carriers & truck owners</h3>
            <p className="mt-1 text-sm text-muted">Add your truck and get loads ranked by real profit — after fuel, driver, tolls and empty kilometres — plus return loads before you arrive.</p>
            <LinkButton href={session ? "/app" : "/signup"} className="mt-4">{session ? "Open my workspace" : "Add your truck"}</LinkButton>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <Plus className="h-6 w-6 text-brand" />
            <h3 className="mt-3 text-lg font-semibold">Shippers & brokers</h3>
            <p className="mt-1 text-sm text-muted">Post a load in a minute. It appears in this catalog and is matched to suitable trucks automatically.</p>
            <LinkButton href="/app/post" variant="outline" className="mt-4">Post a load</LinkButton>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

