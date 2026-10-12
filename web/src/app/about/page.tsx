import {
  ArrowRight, BadgeCheck, BarChart3, Brain, Calculator, Check, Layers, MapPinned, Repeat, Send, ShieldCheck, Sparkles, Truck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LinkButton } from "@/components/ui/primitives";
import { getSession } from "@/server/auth/session";
import { CountryTag, RouteLabel } from "@/components/loads/parts";

const ROUTES: [string, string, string, string][] = [
  ["UZ", "Tashkent", "KZ", "Almaty"], ["UZ", "Tashkent", "KZ", "Astana"], ["UZ", "Tashkent", "KG", "Bishkek"], ["UZ", "Tashkent", "TJ", "Dushanbe"],
  ["UZ", "Fergana", "RU", "Moscow"], ["UZ", "Samarkand", "RU", "Moscow"], ["UZ", "Andijan", "RU", "Yekaterinburg"], ["CN", "Urumqi", "UZ", "Tashkent"],
  ["CN", "Kashgar", "UZ", "Andijan"], ["TR", "Istanbul", "UZ", "Tashkent"], ["UZ", "Tashkent", "AZ", "Baku"], ["UZ", "Tashkent", "GE", "Tbilisi"],
  ["UZ", "Samarkand", "TM", "Ashgabat"], ["UZ", "Tashkent", "BY", "Minsk"], ["UZ", "Tashkent", "AM", "Yerevan"], ["UZ", "Bukhara", "UZ", "Tashkent"],
];

export default async function Landing() {
  const session = await getSession();
  const primary = session ? "/app/loads" : "/signup";
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden gap-6 text-sm text-muted md:flex" aria-label="Sections">
            <a href="#matching" className="hover:text-fg">AI matching</a>
            <a href="#backhaul" className="hover:text-fg">Backhaul</a>
            <a href="#market" className="hover:text-fg">Market</a>
            <a href="#data" className="hover:text-fg">Data sources</a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {session ? (
              <LinkButton href="/app" size="sm">Open app</LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="ghost" size="sm">Sign in</LinkButton>
                <LinkButton href="/signup" size="sm" className="hidden sm:inline-flex">Get started</LinkButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,var(--brand-soft),transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
                <Sparkles className="h-3.5 w-3.5 text-brand" /> Freight intelligence for Uzbekistan & Central Asia
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Find the right load for every truck.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">
                AI-powered freight intelligence for carriers and truck owners in Uzbekistan. Loads from many sources in one place — ranked for your truck, your location and your costs.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <LinkButton href={primary} size="lg">Find loads <ArrowRight className="h-4 w-4" /></LinkButton>
                <LinkButton href={session ? "/app/fleet/new" : "/signup"} size="lg" variant="outline"><Truck className="h-4 w-4" /> Add your truck</LinkButton>
              </div>
              <p className="mt-4 text-xs text-subtle">Setup takes under a minute. No card required.</p>
            </div>
            <HeroFlow />
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.2fr] md:py-20">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your truck should not run empty.</h2>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                ["Dozens of boards", "Owners scroll ATI-style boards, Telegram groups and phone calls to find one load."],
                ["Cheap ≠ profitable", "A high rate 300 km away can earn less than a fair rate next door once fuel and empty km count."],
                ["The return trip", "Trucks arrive in Almaty or Moscow without a plan for the way back — and drive home empty."],
              ].map(([t, d]) => (
                <div key={t}>
                  <div className="text-sm font-semibold">{t}</div>
                  <p className="mt-1.5 text-sm text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand">One platform</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Loads, trucks and market intelligence — together.</h2>
            <p className="mt-4 text-muted">Not “what loads exist?” but “which loads are best for <em>my</em> trucks?”</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [Layers, "One deduplicated board", "The same load posted on three boards shows up once — with all its sources and the best rate."],
              [Brain, "AI matching", "Every load scored against each truck: body, capacity, location, dates, rate, broker and your preferences."],
              [Calculator, "Real profitability", "Fuel, driver, maintenance, tolls and deadhead per truck. Deterministic maths, never guessed by an LLM."],
              [Repeat, "Backhaul before arrival", "When a truck takes a load, we search return loads around its destination right away."],
              [BarChart3, "Market intelligence", "Lane rates, trends and supply/demand computed from actual freight — or clearly marked as insufficient."],
              [Truck, "Fleet management", "Status, location, availability, utilization and profit per truck in one view."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Brain;
              return (
                <div key={t as string} className="rounded-xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><I className="h-4.5 w-4.5" /></div>
                  <h3 className="mt-4 font-semibold">{t as string}</h3>
                  <p className="mt-1.5 text-sm text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* AI matching */}
        <section id="matching" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-brand">AI matching</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Every score comes with the reason.</h2>
              <p className="mt-4 text-muted">No black boxes. You see how each factor contributed and why the load is — or isn&apos;t — a good fit for your truck.</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {["Truck compatibility & capacity", "Distance to pickup and empty-km share", "Rate vs. the lane's recent median", "Broker reliability from platform data", "Your routes, cargo and payment preferences"].map((x) => (
                  <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-brand" />{x}</li>
                ))}
              </ul>
            </div>
            <ExampleMatch />
          </div>
        </section>

        {/* Backhaul */}
        <section id="backhaul" className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
          <div className="order-2 rounded-2xl border border-border bg-surface p-6 shadow-card lg:order-1">
            <div className="text-xs font-medium text-subtle">EXAMPLE</div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <Repeat className="h-5 w-5 text-brand" />
              <span><strong>Truck T-1024</strong> arrives in Almaty in ~2 days.</span>
            </div>
            <div className="mt-4 space-y-2">
              {[["Almaty → Tashkent", "91%"], ["Almaty → Bishkek", "84%"], ["Almaty → Astana", "78%"]].map(([r, s], i) => (
                <div key={r} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${i === 0 ? "bg-brand-soft" : "bg-surface-2"}`}>
                  <span className="font-medium">{r}</span>
                  <span className="num text-muted">{s} match</span>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-brand">Backhaul & route chaining</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plan the way back before you leave.</h2>
            <p className="mt-4 text-muted">As soon as a truck is assigned a load, Karvon looks for return and onward loads near its destination — and ranks whole trip chains by profit per day.</p>
          </div>
        </section>

        {/* Market + broker */}
        <section id="market" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-5 px-4 py-16 sm:px-6 md:grid-cols-3 md:py-24">
            <div className="md:col-span-3 md:mb-6">
              <p className="text-sm font-medium text-brand">Intelligence you can trust</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Numbers are calculated, sourced — or not shown.</h2>
            </div>
            {[
              [BarChart3, "Lane analytics", "Median, range and trend per lane, plus loads-to-trucks ratio. Below 5 observations we say “insufficient market data”."],
              [MapPinned, "Uzbekistan heatmap", "Outbound freight density and available trucks for Tashkent, Fergana, Samarkand, Bukhara and beyond."],
              [BadgeCheck, "Broker intelligence", "Reliability computed from verification, carrier reviews and payment behaviour on the platform — with the formula shown."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Brain;
              return (
                <div key={t as string} className="rounded-xl border border-border bg-bg p-5">
                  <I className="h-5 w-5 text-brand" />
                  <h3 className="mt-3 font-semibold">{t as string}</h3>
                  <p className="mt-1.5 text-sm text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Routes */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built around Uzbekistan&apos;s corridors.</h2>
          <p className="mt-3 max-w-2xl text-muted">Domestic lanes plus Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Russia, China, Turkey, the Caucasus and Belarus. New countries plug in without code changes to matching.</p>
          <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ROUTES.map(([oc, o, dc, d]) => (
              <div key={o + d} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
                <CountryTag code={oc} />{o}<ArrowRight className="h-3.5 w-3.5 text-subtle" /><CountryTag code={dc} />{d}
              </div>
            ))}
          </div>
        </section>

        {/* Data & Telegram */}
        <section id="data" className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-20">
            <div className="flex gap-4">
              <ShieldCheck className="h-6 w-6 shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold">Legitimate data only</h3>
                <p className="mt-1.5 text-sm text-muted">We connect sources through official APIs, licensed feeds and partner agreements — no scraping, no bypassing logins. Every load shows where it came from and when it was last confirmed.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <Send className="h-6 w-6 shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold">Telegram-ready</h3>
                <p className="mt-1.5 text-sm text-muted">Alerts for new high-value loads, recommendations and truck status are designed for Telegram — where logistics in the region already happens.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">More loaded kilometers.<br className="hidden sm:block" /> Less empty driving. Better profit.</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href={primary} size="lg">Find loads <ArrowRight className="h-4 w-4" /></LinkButton>
            <LinkButton href="/login" size="lg" variant="outline">Explore the demo</LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo className="text-fg" />
          <span>© {new Date().getFullYear()} Karvon · Tashkent, Uzbekistan</span>
        </div>
      </footer>
    </div>
  );
}

/** Product loop illustration: truck → AI matching → best load → profit. Illustrative, not live data. */
function HeroFlow() {
  const steps = [
    { icon: Truck, t: "Your truck", d: "20 t curtainsider · Tashkent · free tomorrow" },
    { icon: Brain, t: "AI matching", d: "Compatibility · deadhead · rate vs lane · broker" },
    { icon: Sparkles, t: "Best load", d: "Tashkent → Almaty · 94% match" },
    { icon: Calculator, t: "Profit", d: "After fuel, driver, tolls and empty km" },
  ];
  return (
    <div className="relative animate-fade-up rounded-2xl border border-border bg-surface p-5 shadow-pop sm:p-6" style={{ animationDelay: "120ms" }} aria-label="How Karvon works (illustration)">
      <div className="mb-4 flex items-center justify-between text-xs text-subtle">
        <span>HOW IT WORKS</span>
        <span>Illustration</span>
      </div>
      <ol className="relative space-y-3">
        <span className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-brand/60 via-brand/30 to-pos/60" aria-hidden />
        {steps.map((s, i) => (
          <li key={s.t} className="relative flex animate-fade-up items-center gap-4 rounded-xl border border-border bg-bg p-3" style={{ animationDelay: `${200 + i * 140}ms` }}>
            <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${i === 3 ? "bg-pos-soft text-pos" : "bg-brand-soft text-brand"}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{s.t}</div>
              <div className="truncate text-xs text-muted">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExampleMatch() {
  const rows: [string, number][] = [["Truck compatibility", 100], ["Location proximity", 98], ["Route compatibility", 96], ["Broker reliability", 95], ["Price attractiveness", 91], ["Deadhead", 88]];
  return (
    <div className="rounded-2xl border border-border bg-bg p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-subtle">EXAMPLE</div>
          <div className="mt-1 text-lg font-semibold"><RouteLabel origin="tashkent" dest="almaty" /></div>
          <div className="text-sm text-muted">20 t · curtainsider · 790 km</div>
        </div>
        <div className="text-right">
          <div className="num text-3xl font-semibold text-pos">94%</div>
          <div className="text-xs text-muted">match</div>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-xs"><span>{k}</span><span className="num">{v}%</span></div>
            <div className="h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand" style={{ width: `${v}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg bg-surface-2 p-3 text-sm">
        <div className="font-medium">Why this load</div>
        <ul className="mt-1.5 space-y-1 text-muted">
          <li>✓ Your truck is 34 km from the loading point</li>
          <li>✓ Offer is above the lane&apos;s recent median rate</li>
          <li>✓ Estimated deadhead is only 4% of the trip</li>
        </ul>
      </div>
    </div>
  );
}
