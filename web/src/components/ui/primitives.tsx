import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/format";

// ───────── Button ─────────
type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:brightness-110 shadow-card",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  outline: "border border-border bg-surface text-fg hover:bg-surface-2",
  danger: "bg-neg text-white hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-[background,filter,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className,
  );

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

// ───────── Card ─────────
export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...p} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-subtle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ───────── Badge ─────────
type Tone = "neutral" | "brand" | "pos" | "neg" | "warn" | "info" | "demo";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  pos: "bg-pos-soft text-pos border-transparent",
  neg: "bg-neg-soft text-neg border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  info: "bg-info-soft text-info border-transparent",
  demo: "bg-transparent text-accent border-accent/50 border-dashed",
};
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-none whitespace-nowrap", tones[tone], className)}
      {...p}
    />
  );
}

// Translated: lives in demo-badge.tsx (a client component that reads the visitor's language).
export { DemoBadge } from "./demo-badge";

// ───────── Form controls ─────────
export const inputClass =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-2 focus:ring-[var(--ring)]";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...p} />;
}
export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-muted", className)} {...p} />;
}
/** Label wraps the control so inputs are always programmatically labelled. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

// ───────── Data display ─────────
export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" | "brand"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("num mt-1 text-xl font-semibold tracking-tight", tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "brand" && "text-brand")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

export function Trend({ value, suffix = "%", invert }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value == null) return <span className="text-subtle">—</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={cn("num font-medium", value === 0 ? "text-muted" : good ? "text-pos" : "text-neg")}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"}{" "}
      {suffix === "%" && Math.abs(value) >= 1000 ? <span title={`${Math.abs(value).toFixed(0)}%`}>&gt;999%</span> : <>{Math.abs(value).toFixed(1)}{suffix}</>}
    </span>
  );
}

export function ScoreBadge({ score, eligible = true, size = "md" }: { score: number; eligible?: boolean; size?: "sm" | "md" | "lg" }) {
  const tone = !eligible ? "text-subtle" : score >= 85 ? "text-pos" : score >= 70 ? "text-brand" : score >= 55 ? "text-warn" : "text-subtle";
  const r = size === "lg" ? 26 : size === "sm" ? 14 : 18;
  const stroke = size === "lg" ? 5 : 3.5;
  const c = 2 * Math.PI * r;
  const dim = (r + stroke) * 2;
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", tone)} style={{ width: dim, height: dim }} aria-label={`Match score ${score}%`}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <span className={cn("num absolute font-semibold", size === "lg" ? "text-base" : size === "sm" ? "text-[9px]" : "text-xs")}>{eligible ? score : "—"}</span>
    </div>
  );
}

export function Bar({ value, tone = "brand", className }: { value: number; tone?: "brand" | "pos" | "warn" | "neg"; className?: string }) {
  const color = { brand: "bg-brand", pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function EmptyState({ icon, title, body, actions }: { icon?: ReactNode; title: string; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {body && <div className="mt-1 max-w-md text-sm text-muted">{body}</div>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
