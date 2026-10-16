import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Truck } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { catalogOverview, latestLoads, type Direction } from "@/server/services/catalog";
import { sourceStats } from "@/server/services/landing";
import { computeProfit, DEFAULT_COST_PROFILE, estimateTollsUsd } from "@/server/services/profitability";
import { estimateRoadKm } from "@/server/domain/geo";
import { autoSyncIfStale } from "@/server/ingestion/registry";
import { db } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { PublicFooter } from "@/components/public/public-header";
import { SearchBar } from "@/components/public/search-bar";
import { LoadTile } from "@/components/public/load-tile";
import { CountryTag, RouteLabel } from "@/components/loads/parts";
import { LandingHeader } from "@/components/landing/landing-header";
import {
  Audiences, Comparison, Faq, Features, FinalCta, HeroCard, HowItWorks, LiveHead, Problem, StatBand, Trust,
  type HeroExample,
} from "@/components/landing/sections";
import { EmptyState, LinkButton } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: { absolute: m.meta.landingTitle },
    description: m.meta.landingDescription,
    openGraph: { title: m.meta.landingOgTitle, description: m.meta.landingOgDescription, type: "website" },
  };
}

/** A typical 20 t truck on a real corridor, priced by the same engine the product uses. */
function heroExample(): HeroExample {
  const origin = "tashkent";
  const dest = "almaty";
  const distanceKm = estimateRoadKm(origin, dest);
  const deadheadKm = 34;
  const p = computeProfit({ ...DEFAULT_COST_PROFILE, revenueUsd: 1250, loadedKm: distanceKm, deadheadKm, tollsUsd: estimateTollsUsd(distanceKm, "UZ", "KZ") });
  return { origin, dest, distanceKm, deadheadKm, p };
}

export default async function Home() {
  autoSyncIfStale(db); // refresh real sources in the background when stale (no-op when the scheduler runs)
  const [session, overview, latest, sources, i] = await Promise.all([getSession(), catalogOverview(), latestLoads(4), sourceStats(), getI18n()]);
  const { t, m, num, km, perKm, usd, city, country, relativeDay } = i;
  const { directions, popularRoutes, totals } = overview;
  const signedIn = !!session;

  const stats = {
    loads: totals.loads,
    routes: totals.routes,
    countries: totals.countries,
    telegramGroups: sources.telegramGroups,
    otherSources: sources.otherSources,
    newestAt: latest[0]?.createdAt ?? null,
  };

  // The catalog service names directions in English; build the visitor's language from the key instead.
  const direction = (d: Direction) => {
    if (d.key === "domestic") return { title: m.directions.domesticTitle, sub: m.directions.domesticSub };
    if (d.key === "transit") return { title: m.directions.transitTitle, sub: m.directions.transitSub };
    if (d.key.startsWith("to-")) return { title: t("directions.toTitle", { country: country(d.country) }), sub: m.directions.toSub };
    return { title: t("directions.fromTitle", { country: country(d.country) }), sub: m.directions.fromSub };
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: m.landing.faq.items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingHeader signedIn={signedIn} />
      {totals.demoShare > 0 && (
        <div className="border-b border-dashed border-accent/40 bg-warn-soft/60 px-4 py-1.5 text-center text-xs text-warn">
          {t("landing.demoBannerPre", { pct: Math.round(totals.demoShare * 100) })} <strong>{m.common.demoData}</strong> {t("landing.demoBannerPost")}
        </div>
      )}

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_0%,var(--brand-soft),transparent)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pb-14 lg:pt-20">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-pos" aria-hidden /> {t("landing.hero.badge")}
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                {t("landing.hero.titleA")}<br />
                <span className="text-brand">{t("landing.hero.titleB")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{t("landing.hero.lead")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <LinkButton href={signedIn ? "/app/loads" : "/signup"} size="lg">{signedIn ? t("landing.hero.ctaBoard") : t("landing.hero.ctaFind")} <ArrowRight className="h-4 w-4" /></LinkButton>
                <LinkButton href="/app/post" size="lg" variant="outline"><Plus className="h-4 w-4" /> {t("landing.hero.ctaPost")}</LinkButton>
              </div>
              <p className="mt-4 text-xs text-subtle">{t("landing.hero.fine")}</p>
            </div>
            <HeroCard ex={heroExample()} />
          </div>

          {/* Search the board */}
          <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
            <p className="mb-2 text-sm font-medium">{t("landing.hero.searchTitle")}</p>
            <SearchBar />
            {popularRoutes.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-subtle">{t("landing.hero.popular")}</span>
                {popularRoutes.slice(0, 6).map((r) => (
                  <Link key={r.slug} href={`/routes/${r.slug}`} className="rounded-full border border-border bg-surface px-3 py-1 text-muted transition hover:border-brand hover:text-fg">
                    <RouteLabel origin={r.origin} dest={r.dest} size="sm" className="font-medium" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <StatBand s={stats} />
        <Problem />
        <HowItWorks signedIn={signedIn} />
        <Features stats={stats} />
        <Comparison />
        <Audiences signedIn={signedIn} />

        {/* Live data: proof the board is real, and the entry point for visitors who want to look first */}
        <section id="directions" className="scroll-mt-16 border-t border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
            {totals.loads === 0 ? (
              <EmptyState icon={<Truck className="h-5 w-5" />} title={t("landing.live.emptyTitle")} body={t("landing.live.emptyBody")} actions={<LinkButton href="/app/post">{t("common.postLoad")}</LinkButton>} />
            ) : (
              <>
                <LiveHead total={totals.loads} />
                <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {directions.slice(0, 6).map((d) => {
                    const dir = direction(d);
                    return (
                      <Link key={d.key} href={d.href} className="group flex min-w-0 flex-col rounded-xl border border-border bg-bg p-4 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-pop">
                        <div className="flex items-center justify-between">
                          <CountryTag code={d.country} />
                          <ArrowRight className="h-4 w-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />
                        </div>
                        <div className="mt-3 truncate font-semibold">{dir.title}</div>
                        <div className="truncate text-xs text-muted">{dir.sub}</div>
                        <div className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                          <span className="num font-semibold">{t("landing.live.loadsCount", { n: num(d.loads) })}</span>
                          {d.minRateUsd != null && <span className="num text-xs text-muted">{t("landing.live.from")} {usd(d.minRateUsd)}</span>}
                        </div>
                        <div className="mt-2 truncate text-xs text-subtle">{d.routes.slice(0, 2).map((r) => `${city(r.origin)} → ${city(r.dest)}`).join(" · ")}</div>
                      </Link>
                    );
                  })}
                </div>

                <h3 className="mt-12 text-lg font-semibold">{t("landing.live.busiest")}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {popularRoutes.slice(0, 6).map((r) => (
                    <Link key={r.slug} href={`/routes/${r.slug}`} className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-bg p-4 transition hover:border-border-strong hover:shadow-pop">
                      <div className="min-w-0 flex-1">
                        <RouteLabel origin={r.origin} dest={r.dest} size="sm" />
                        <div className="mt-1 text-xs text-muted">
                          {km(r.distanceKm)} · {t("landing.live.loadsCount", { n: num(r.loads) })}{r.nextLoading && ` · ${t("landing.live.next", { day: relativeDay(r.nextLoading).toLowerCase() })}`}
                        </div>
                      </div>
                      {r.minRateUsd != null && (
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-muted">{t("landing.live.from")}</div>
                          <div className="num font-semibold">{usd(r.minRateUsd)}</div>
                          {r.medianPerKm != null && <div className="num text-xs text-subtle">~{perKm(r.medianPerKm)}</div>}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>

                <div className="mt-12 flex items-end justify-between gap-3">
                  <h3 className="text-lg font-semibold">{t("landing.live.justPosted")}</h3>
                  <Link href="/catalog?sort=newest" className="text-sm text-brand hover:underline">{t("landing.live.seeAll")}</Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {latest.map((o) => <LoadTile key={o.id} o={o} />)}
                </div>
              </>
            )}
          </div>
        </section>

        <Trust />
        <Faq />
        <FinalCta signedIn={signedIn} />
      </main>

      <PublicFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
