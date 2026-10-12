import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const perKm = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}/km`);

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", RUB: "₽", KZT: "₸", CNY: "¥", UZS: "" };
export function money(amount: number, currency: string) {
  if (currency === "USD") return usd(amount);
  const s = SYMBOL[currency] ?? "";
  const v = amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return currency === "UZS" ? `${v} UZS` : `${s}${v}`;
}

export const km = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} km`);
export const tonnes = (kg: number) => `${(kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} t`;
export const pct = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);
export const signedPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export function shortDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Tashkent" });
}
export function dateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
}

export function ago(d: Date | string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Listings not re-seen by any source within 6 h are flagged as possibly outdated. */
export const STALE_AFTER_MS = 6 * 3_600_000;
export const isStale = (lastSeen: Date | string) => Date.now() - new Date(lastSeen).getTime() > STALE_AFTER_MS;

export function relativeDay(d: Date | string) {
  const date = new Date(d);
  const tz = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  const today = tz(new Date());
  const tomorrow = tz(new Date(Date.now() + 86_400_000));
  const v = tz(date);
  if (v === today) return "Today";
  if (v === tomorrow) return "Tomorrow";
  return shortDate(date);
}
