import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, BadgeCheck, BarChart3, Bell, Brain, Calculator, Check, ChevronDown, Clock, Layers, PackagePlus, Repeat,
  ShieldCheck, Sparkles, Truck, Users, X,
} from "lucide-react";
import type { ProfitBreakdown } from "@/server/services/profitability";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/format";
import { LinkButton, ScoreBadge } from "../ui/primitives";
import { RouteLabel } from "../loads/parts";

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
export async function HeroCard({ ex }: { ex: HeroExample }) {
  const { t, km, usd, city, m } = await getI18n();
  const costs: [string, number][] = [[m.calc.fuel, ex.p.fuel], [m.calc.driver, ex.p.driver], [m.calc.maintenance, ex.p.maintenance], [m.calc.tolls, ex.p.tolls], [m.calc.otherShort, ex.p.other]];
  return (
    <div className="relative animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--brand-soft),transparent)]" aria-hidden />
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop sm:p-6" role="img" aria-label={t("landing.card.aria")}>
        <div className="flex items-center justify-between gap-3 text-xs text-subtle">
          <span className="font-medium tracking-wide">{t("landing.card.example")}</span>
          <span className="text-right">{t("landing.card.calculated")}</span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold"><RouteLabel origin={ex.origin} dest={ex.dest} /></div>
            <div className="mt-0.5 text-sm text-muted">{t("landing.card.spec", { km: km(ex.distanceKm) })}</div>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <ScoreBadge score={94} size="lg" />
            <span className="mt-1 text-[11px] text-muted">{t("landing.card.match")}</span>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{t("landing.card.revenue")}</span>
            <span className="num font-medium">{usd(ex.p.revenue)}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {costs.map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span className="num">−{usd(v)}</span></li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong pt-3">
            <span className="font-semibold">{t("landing.card.profit")}</span>
            <span className={cn("num text-2xl font-semibold", ex.p.profit >= 0 ? "text-pos" : "text-neg")}>{usd(ex.p.profit)}</span>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> {t("landing.card.deadheadLine", { km: km(ex.deadheadKm), pct: Math.round(ex.p.emptyPct * 100) })}</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> {t("landing.card.rateLine")}</li>
        </ul>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-brand/40 bg-brand-soft/50 px-3.5 py-2.5 text-sm">
          <Repeat className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0"><strong className="font-semibold">{t("landing.card.returnTitle")}</strong> <span className="text-muted">{t("landing.card.returnBody", { city: city(ex.dest) })}</span></span>
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
  newestAt: Date | null;
}

export async function StatBand({ s }: { s: LiveStats }) {
  const { t, num, ago } = await getI18n();
  const tiles: [string, string, string][] = [
    [num(s.loads), t("landing.stats.loads"), t("landing.stats.loadsSub")],
    [num(s.routes), t("landing.stats.routes"), t("landing.stats.routesSub")],
    [num(s.countries), t("landing.stats.countries"), t("landing.stats.countriesSub")],
  ];
  // What sets Karvon apart rather than a count: every load carries an A–D trust grade.
  tiles.push(["A–D", t("landing.stats.grade"), t("landing.stats.gradeSub")]);
  return (
    <section aria-label={t("landing.stats.aria")} className="border-y border-border bg-surface">
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
        {s.newestAt && (
          <p className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-pos" /></span>
            {t("landing.stats.live", { ago: ago(s.newestAt) })}
          </p>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── problem ───────────────────────── */

export async function Problem() {
  const { m } = await getI18n();
  return (
    <section className={cn(wrap, "py-16 md:py-24")}>
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.landing.problem.title}</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {m.landing.problem.items.map((it) => (
            <div key={it.title}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neg-soft text-neg"><X className="h-4 w-4" /></div>
              <h3 className="mt-3 text-sm font-semibold">{it.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── how it works ───────────────────────── */

const HOW_ICONS = [Truck, Sparkles, Repeat] as const;

export async function HowItWorks({ signedIn }: { signedIn: boolean }) {
  const { m } = await getI18n();
  const h = m.landing.how;
  return (
    <section id="how" className="scroll-mt-16 border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow={h.eyebrow} title={h.title} center />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {h.steps.map((s, i) => {
            const Icon = HOW_ICONS[i];
            return (
              <li key={s.title} className="relative rounded-2xl border border-border bg-bg p-6">
                <span className="num absolute right-5 top-4 text-5xl font-semibold text-surface-3" aria-hidden>{i + 1}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.body}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href={signedIn ? "/app/fleet/new" : "/signup"} size="lg"><Truck className="h-4 w-4" /> {h.ctaTruck}</LinkButton>
          <LinkButton href="/catalog" size="lg" variant="outline">{h.ctaBoard} <ArrowRight className="h-4 w-4" /></LinkButton>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── features ───────────────────────── */

const FEATURE_ICONS = [Layers, Brain, Calculator, Repeat, BarChart3, BadgeCheck, Bell, Users] as const;

export async function Features({ stats }: { stats: Pick<LiveStats, "telegramGroups"> }) {
  const { m } = await getI18n();
  const f = m.landing.features;
  return (
    <section id="features" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow={f.eyebrow} title={f.title} subtitle={f.subtitle} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {f.items.map((it, i) => {
          const Icon = FEATURE_ICONS[i];
          // The first card names Telegram only when groups have actually delivered ads.
          const body = i === 0 && stats.telegramGroups === 0 ? f.feedNoTelegram : it.body;
          return (
            <div key={it.title} className="rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-semibold">{it.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── comparison ───────────────────────── */

export async function Comparison() {
  const { m } = await getI18n();
  const c = m.landing.compare;
  return (
    <section className="border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow={c.eyebrow} title={c.title} center />
        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-border bg-bg">
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] border-b border-border bg-surface-2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
            <span />
            <span>{c.without}</span>
            <span className="text-brand">{c.with}</span>
          </div>
          <ul className="divide-y divide-border">
            {c.rows.map((r) => (
              <li key={r.q} className="grid gap-1.5 px-5 py-4 text-sm sm:grid-cols-[1.1fr_1fr_1fr] sm:gap-4">
                <span className="font-medium">{r.q}</span>
                <span className="flex gap-2 text-muted"><X role="img" className="mt-0.5 h-4 w-4 shrink-0 text-neg" aria-label={c.noMark} />{r.bad}</span>
                <span className="flex gap-2"><Check role="img" className="mt-0.5 h-4 w-4 shrink-0 text-pos" aria-label={c.yesMark} />{r.good}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── audiences ───────────────────────── */

const AUDIENCE_ICONS = [Truck, Users, PackagePlus] as const;

export async function Audiences({ signedIn }: { signedIn: boolean }) {
  const { m } = await getI18n();
  const a = m.landing.audience;
  const ctas: ReactNode[] = [
    <LinkButton key="a" href={signedIn ? "/app/fleet/new" : "/signup"}>{a.ctaTruck}</LinkButton>,
    <LinkButton key="b" href={signedIn ? "/app" : "/signup"} variant="outline">{a.ctaFleet}</LinkButton>,
    <LinkButton key="c" href="/app/post" variant="outline">{a.ctaPost}</LinkButton>,
  ];
  return (
    <section id="audience" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow={a.eyebrow} title={a.title} center />
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {a.cards.map((c, i) => {
          const Icon = AUDIENCE_ICONS[i];
          return (
            <div key={c.title} className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-muted">{c.lead}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {c.points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{p}</li>)}
              </ul>
              <div className="mt-6 pt-1 lg:mt-auto lg:pt-6">{ctas[i]}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── live loads (wraps real data from the page) ───────────────────────── */

export async function LiveHead({ total }: { total: number }) {
  const { t, num } = await getI18n();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <SectionHead eyebrow={t("landing.live.eyebrow")} title={t("landing.live.title")} subtitle={t("landing.live.subtitle", { n: num(total) })} />
      <Link href="/catalog" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">{t("landing.live.allLoads")} <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

/* ───────────────────────── trust ───────────────────────── */

const TRUST_ICONS = [ShieldCheck, Clock, BarChart3, Calculator] as const;

export async function Trust() {
  const { m } = await getI18n();
  const tr = m.landing.trust;
  return (
    <section className="border-y border-border bg-surface">
      <div className={cn(wrap, "py-16 md:py-24")}>
        <SectionHead eyebrow={tr.eyebrow} title={tr.title} subtitle={tr.subtitle} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {tr.items.map((it, i) => {
            const Icon = TRUST_ICONS[i];
            return (
              <div key={it.title} className="flex gap-4 rounded-2xl border border-border bg-bg p-5">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
                <div>
                  <h3 className="font-semibold">{it.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{it.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

export async function Faq() {
  const { m } = await getI18n();
  const f = m.landing.faq;
  return (
    <section id="faq" className={cn(wrap, "scroll-mt-16 py-16 md:py-24")}>
      <SectionHead eyebrow={f.eyebrow} title={f.title} center />
      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {f.items.map((it) => (
          <details key={it.q} className="group rounded-xl border border-border bg-surface px-5 py-4 shadow-card open:border-border-strong">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {it.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm text-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── final call to action ───────────────────────── */

export async function FinalCta({ signedIn }: { signedIn: boolean }) {
  const { m } = await getI18n();
  const f = m.landing.final;
  return (
    <section className={cn(wrap, "pb-6")}>
      <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-brand-fg sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgb(255_255_255/0.18),transparent)]" aria-hidden />
        <h2 className="relative mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{f.title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl opacity-90 sm:text-lg">{f.lead}</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href={signedIn ? "/app/loads" : "/signup"} size="lg" className="bg-brand-fg text-brand hover:brightness-95">{signedIn ? f.ctaSignedIn : f.ctaGuest} <ArrowRight className="h-4 w-4" /></LinkButton>
          <LinkButton href="/catalog" size="lg" variant="ghost" className="text-brand-fg hover:bg-white/10 hover:text-brand-fg">{f.ctaBrowse}</LinkButton>
        </div>
      </div>
    </section>
  );
}
