import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, BadgeCheck, BarChart3, Bell, Brain, Calculator, Check, ChevronDown, Clock, Layers, PackagePlus, Repeat,
  ShieldCheck, Sparkles, Truck, Users, X,
} from "lucide-react";
import type { ProfitBreakdown } from "@/server/services/profitability";
import { cn, usd } from "@/lib/format";
import { LinkButton, ScoreBadge } from "../ui/primitives";
import { cityLabel, RouteLabel } from "../loads/parts";

/* ───────────────────────── shared pieces ───────────────────────── */

function SectionHead({ eyebrow, title, subtitle, center }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-muted sm:text-lg">{subtitle}</p>}
    </div>
  );
}

const wrap = "mx-auto max-w-7xl px-4 sm:px-6";

/* ───────────────────────── hero ───────────────────────── */

export interface HeroExample {
  origin: string;
  dest: string;
  distanceKm: number;
  deadheadKm: number;
  p: ProfitBreakdown;
}

/**
 * The hero card. Every figure comes from the same profit engine the product uses (computed on
 * the server from a typical 20 t truck), so the example can't drift from what a user would see.
 * It is labelled as an example because the load itself is illustrative.
 */
export function HeroCard({ ex }: { ex: HeroExample }) {
  const costs: [string, number][] = [["Fuel", ex.p.fuel], ["Driver", ex.p.driver], ["Maintenance", ex.p.maintenance], ["Tolls & border", ex.p.tolls], ["Other", ex.p.other]];
  return (
    <div className="relative animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--brand-soft),transparent)]" aria-hidden />
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop sm:p-6" role="img" aria-label="Example of a load ranked for a truck, with its profit breakdown">
        <div className="flex items-center justify-between text-xs text-subtle">
          <span className="font-medium tracking-wide">EXAMPLE LOAD</span>
          <span>calculated by Karvon&apos;s engine</span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold"><RouteLabel origin={ex.origin} dest={ex.dest} /></div>
            <div className="mt-0.5 text-sm text-muted">20 t · curtainsider · {ex.distanceKm.toLocaleString("en-US")} km</div>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <ScoreBadge score={94} size="lg" />
            <span className="mt-1 text-[11px] text-muted">match</span>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Revenue</span>
            <span className="num font-medium">{usd(ex.p.revenue)}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {costs.map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span className="num">−{usd(v)}</span></li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong pt-3">
            <span className="font-semibold">Estimated profit</span>
            <span className={cn("num text-2xl font-semibold", ex.p.profit >= 0 ? "text-pos" : "text-neg")}>{usd(ex.p.profit)}</span>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> Truck is {ex.deadheadKm} km from the loading point — {Math.round(ex.p.emptyPct * 100)}% empty driving</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> Rate checked against the lane&apos;s recent median</li>
        </ul>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-brand/40 bg-brand-soft/50 px-3.5 py-2.5 text-sm">
          <Repeat className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0"><strong className="font-semibold">Return load found</strong> <span className="text-muted">near {cityLabel(ex.dest)} — before you arrive</span></span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── live numbers ───────────────────────── */

export interface LiveStats {
  loads: number;
  routes: number;
  countries: number;
  telegramGroups: number;
  otherSources: number;
  newestLabel: string | null;
}

export function StatBand({ s }: { s: LiveStats }) {
  const tiles: [string, string, string][] = [
    [s.loads.toLocaleString("en-US"), "active loads", "on the board right now"],
    [String(s.routes), "routes", "between cities we cover"],
    [String(s.countries), "countries", "Uzbekistan and its corridors"],
  ];
  const sourceCount = s.telegramGroups + s.otherSources;
  if (sourceCount > 0) tiles.push([sourceCount.toLocaleString("en-US"), "sources", s.telegramGroups > 0 ? `incl. ${s.telegramGroups.toLocaleString("en-US")} Telegram groups` : "feeds and brokers"]);
  return (
    <section aria-label="Platform in numbers" className="border-y border-border bg-surface">
      <div className={cn(wrap, "py-8")}>
        <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-6", tiles.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {tiles.map(([n, l, sub]) => (
            // <dt> must precede <dd> in the DOM; flex order puts the big number first visually.
            <div key={l} className="flex min-w-0 flex-col">
              <dt className="order-2 mt-1 text-sm font-medium">{l}</dt>
              <dd className="num order-1 text-3xl font-semibold tracking-tight sm:text-4xl">{n}</dd>
              <div className="order-3 text-xs text-muted">{sub}</div>
            </div>
          ))}
        </dl>
        {s.newestLabel && (
          <p className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-pos" /></span>
            Live numbers from the platform · newest load posted {s.newestLabel}
          </p>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── problem ───────────────────────── */

export function Problem() {
  const items: [string, string][] = [
    ["Loads are scattered", "Hundreds of Telegram groups, boards and phone calls — and the same load reposted in five of them."],
    ["A good rate isn't a good load", "A high price 300 km away can earn less than a fair one next door, once fuel, tolls and empty kilometres count."],
    ["The way back is an afterthought", "Trucks reach Almaty or Moscow with no plan for the return — and drive home empty."],
  ];
  return (
    <section className={cn(wrap, "py-16 md:py-24")}>
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">An empty truck is a truck that is losing money.</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {items.map(([t, d]) => (
            <div key={t}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neg-soft text-neg"><X className="h-4 w-4" /></div>
              <h3 className="mt-3 text-sm font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── how it works ───────────────────────── */

export function HowItWorks({ signedIn }: { signedIn: boolean }) {
  const steps: [typeof Truck, string, string][] = [
    [Truck, "Add your truck", "Body type, capacity, where it stands and what it costs to run per kilometre. About a minute."],
    [Sparkles, "See what actually pays", "Every load gets a 0–100 score for your truck, the reasons behind it, and the estimated profit."],
    [Repeat, "Take it — and plan the way back", "Assign the load and Karvon starts looking for return loads around the destination straight away."],
  ];
  return (
    <section id="how" className="scroll-mt-16 border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow="How it works" title="From “where is a load?” to “which load is best for me?”" center />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map(([Icon, t, d], i) => (
            <li key={t} className="relative rounded-2xl border border-border bg-bg p-6">
              <span className="num absolute right-5 top-4 text-5xl font-semibold text-surface-3" aria-hidden>{i + 1}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href={signedIn ? "/app/fleet/new" : "/signup"} size="lg"><Truck className="h-4 w-4" /> Add your truck</LinkButton>
          <LinkButton href="/catalog" size="lg" variant="outline">Look at the board first <ArrowRight className="h-4 w-4" /></LinkButton>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── features ───────────────────────── */

export function Features({ stats }: { stats: Pick<LiveStats, "telegramGroups"> }) {
  const feats: [typeof Layers, string, string][] = [
    [Layers, "All loads, one board", stats.telegramGroups > 0
      ? `Telegram groups, DIIP.UZ and brokers who post directly. Duplicates merge into one load that lists every source and when it was last seen.`
      : "Public feeds and brokers who post directly. Duplicates merge into one load that lists every source and when it was last seen."],
    [Brain, "Ranked for your truck", "Body type, capacity, distance to pickup, dates, rate, broker and your own preferences — each factor shown, nothing hidden."],
    [Calculator, "Profit, not just price", "Fuel, driver, maintenance, tolls and empty kilometres calculated per truck. Plain arithmetic — never guessed by an AI."],
    [Repeat, "Return loads before you arrive", "Take a load and we search around its destination immediately, then rank whole round trips by profit per day."],
    [BarChart3, "Market rates you can trust", "Median, range and trend for each lane from real postings — or an honest “not enough data” instead of an invented number."],
    [BadgeCheck, "Know the broker", "Reliability from verification, carrier reviews and payment behaviour on the platform, with the formula shown."],
    [Bell, "Alerts on your lanes", "Save a search once and get notified in the app when a matching load appears."],
    [Users, "Built for fleets", "Trucks, statuses, locations and roles. Dispatchers see and assign loads without touching settings."],
  ];
  return (
    <section id="features" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow="Why Karvon" title="Everything between “a load exists” and “I earned money on it.”" subtitle="Built around Uzbekistan's corridors and the way freight is really found here." />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {feats.map(([Icon, t, d]) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></div>
            <h3 className="mt-4 font-semibold">{t}</h3>
            <p className="mt-1.5 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── comparison ───────────────────────── */

const COMPARE: [string, string, string][] = [
  ["Where the loads are", "Dozens of groups and chats, scrolled by hand", "One searchable board"],
  ["Same load posted again and again", "You read it five times", "Merged into one, with every source listed"],
  ["Is it profitable?", "Mental arithmetic and a guess", "Profit after fuel, driver, tolls and empty km"],
  ["Is the rate fair?", "Ask around", "Lane median and trend, when there is enough data"],
  ["What about the return trip?", "Start phoning when you arrive", "Suggested as soon as you take the load"],
  ["Is the broker reliable?", "Reputation by word of mouth", "Score from platform reviews, formula shown"],
  ["Is it still available?", "Call and find out", "“Last seen” time on every listing"],
];

export function Comparison() {
  return (
    <section className="border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow="The difference" title="Searching chats vs. searching Karvon" center />
        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-border bg-bg">
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] border-b border-border bg-surface-2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
            <span />
            <span>Telegram chats &amp; phone calls</span>
            <span className="text-brand">Karvon</span>
          </div>
          <ul className="divide-y divide-border">
            {COMPARE.map(([q, bad, good]) => (
              <li key={q} className="grid gap-1.5 px-5 py-4 text-sm sm:grid-cols-[1.1fr_1fr_1fr] sm:gap-4">
                <span className="font-medium">{q}</span>
                <span className="flex gap-2 text-muted"><X role="img" className="mt-0.5 h-4 w-4 shrink-0 text-neg" aria-label="Without Karvon:" />{bad}</span>
                <span className="flex gap-2"><Check role="img" className="mt-0.5 h-4 w-4 shrink-0 text-pos" aria-label="With Karvon:" />{good}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── audiences ───────────────────────── */

export function Audiences({ signedIn }: { signedIn: boolean }) {
  const cards: { icon: typeof Truck; title: string; lead: string; points: string[]; cta: ReactNode }[] = [
    {
      icon: Truck, title: "Owner-operators & carriers",
      lead: "One truck, one decision a day: which load?",
      points: ["Loads ranked by real profit, not just rate", "Return load before you reach the destination", "See the broker's track record before you call"],
      cta: <LinkButton href={signedIn ? "/app/fleet/new" : "/signup"}>Add your truck</LinkButton>,
    },
    {
      icon: Users, title: "Fleets & dispatchers",
      lead: "Many trucks, one view of what each should do next.",
      points: ["Best truck for every load, best load for every truck", "Utilisation, empty km and profit per km per truck", "Roles: dispatchers search and assign, admins manage"],
      cta: <LinkButton href={signedIn ? "/app" : "/signup"} variant="outline">Set up your fleet</LinkButton>,
    },
    {
      icon: PackagePlus, title: "Shippers & brokers",
      lead: "Get your cargo moving without calling around.",
      points: ["Post a load in about a minute", "It appears on the public board right away", "Matched to suitable trucks automatically"],
      cta: <LinkButton href="/app/post" variant="outline">Post a load</LinkButton>,
    },
  ];
  return (
    <section id="audience" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow="Who it's for" title="Made for everyone who moves freight here." center />
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><c.icon className="h-5 w-5" /></div>
            <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted">{c.lead}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {c.points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{p}</li>)}
            </ul>
            <div className="mt-6 pt-1 lg:mt-auto lg:pt-6">{c.cta}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── live loads (wraps real data from the page) ───────────────────────── */

export function LiveHead({ total }: { total: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <SectionHead eyebrow="Live on the board" title="See real loads before you sign up." subtitle={`${total.toLocaleString("en-US")} active loads — browse by direction, route or search. Contacts, match score and profit unlock when you sign in.`} />
      <Link href="/catalog" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">All loads <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

/* ───────────────────────── trust ───────────────────────── */

export function Trust() {
  const items: [typeof ShieldCheck, string, string][] = [
    [ShieldCheck, "Legitimate sources only", "Official APIs, licensed feeds, partner agreements and public Telegram groups read with their admins' consent. No scraping, no bypassing logins."],
    [Clock, "Source and freshness on every load", "You always see where a load came from and when it was last confirmed — and stale ones are marked."],
    [BarChart3, "Numbers or nothing", "With too little data we say “insufficient market data” rather than invent a rate. Implausible rates are hidden and left out of statistics."],
    [Calculator, "Money is arithmetic", "Scores, distances, costs and profit come from deterministic code with unit tests. An AI may phrase an answer; it never computes money."],
  ];
  return (
    <section className="border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow="Honest by design" title="You can check our work." subtitle="A load board is only useful if you can trust what it shows." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {items.map(([Icon, t, d]) => (
            <div key={t} className="flex gap-4 rounded-2xl border border-border bg-bg p-5">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

export const FAQ: [string, string][] = [
  ["Where do the loads come from?", "From public freight feeds such as DIIP.UZ, public Telegram groups whose admins agreed to be read, loads that shippers and brokers post on Karvon, and CSV uploads by operators. We do not scrape sites that forbid it. Every load shows its sources."],
  ["How is the profit calculated?", "From your truck's own cost profile: fuel consumption and price, driver cost per kilometre, maintenance, an estimate of tolls and border fees, and the empty kilometres to reach the pickup. It is plain arithmetic, shown line by line, and you can change any input."],
  ["Is the market rate real?", "It is computed from the rates posted on loads in our database over the last 30 days, not from completed payments. A lane needs at least five postings before we show a median; below that we say there is not enough data."],
  ["Do I need an account to look at loads?", "No. The board, routes and load pages are public. Contact details, your match score and the profit estimate need a free sign-in."],
  ["Which countries are covered?", "Uzbekistan and its corridors: Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Russia, China, Turkey, Azerbaijan, Georgia, Armenia and Belarus."],
  ["Does it cost anything?", "Signing up takes about a minute and there is no payment step right now."],
  ["Can I post my own load?", "Yes. Shippers and brokers can post a load in about a minute; it joins the same board and is matched to suitable trucks."],
];

export function Faq() {
  return (
    <section id="faq" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow="Questions" title="Straight answers." center />
      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-border bg-surface px-5 py-4 shadow-card open:border-border-strong">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── final call to action ───────────────────────── */

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={cn(wrap, "pb-6")}>
      <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-brand-fg sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgb(255_255_255/0.18),transparent)]" aria-hidden />
        <h2 className="relative mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">More loaded kilometres. Less empty driving. Better profit.</h2>
        <p className="relative mx-auto mt-4 max-w-xl opacity-90 sm:text-lg">Add your truck and see what the board looks like when it is ranked for you.</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href={signedIn ? "/app/loads" : "/signup"} size="lg" className="bg-brand-fg text-brand hover:brightness-95">{signedIn ? "Open the load board" : "Get started"} <ArrowRight className="h-4 w-4" /></LinkButton>
          <LinkButton href="/catalog" size="lg" variant="ghost" className="text-brand-fg hover:bg-white/10 hover:text-brand-fg">Browse loads</LinkButton>
        </div>
      </div>
    </section>
  );
}
