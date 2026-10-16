import { LOCALE_META, type Locale } from "./config";
import type { Messages } from "./messages/en";
import type { Plural } from "./types";

/** Dotted paths to plain-string messages, e.g. "common.signIn" — checked by the compiler. */
type StringKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends Plural
      ? never
      : T[K] extends readonly unknown[]
        ? never
        : string extends keyof T[K]
          ? never // free-form maps (enums, cities…) are read through label()/city()/country()
          : T[K] extends object
            ? StringKeys<T[K], `${P}${K}.`>
            : never;
}[keyof T & string];

/** Dotted paths to plural sets, e.g. "time.dayAgo". */
type PluralKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends Plural
      ? `${P}${K}`
      : T[K] extends readonly unknown[]
        ? never
        : string extends keyof T[K]
          ? never
          : T[K] extends object
            ? PluralKeys<T[K], `${P}${K}.`>
            : never;
}[keyof T & string];

export type StringKey = StringKeys<Messages>;
export type PluralKey = PluralKeys<Messages>;
export type Vars = Record<string, string | number>;

const TZ = "Asia/Tashkent";

function lookup(m: unknown, path: string): unknown {
  let cur = m;
  for (const part of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return cur;
}

export function interpolate(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole)) : s;
}

const SYMBOL: Record<string, string> = { EUR: "€", RUB: "₽", KZT: "₸", CNY: "¥" };

/**
 * Everything a component needs to speak one language: messages, plurals and locale-aware
 * numbers, dates and units. Pure (no React, no Next) so the same factory serves server
 * components (getI18n) and client components (useI18n) and can be unit-tested.
 */
export function createI18n(locale: Locale, m: Messages) {
  const intl = LOCALE_META[locale].intl;
  const rules = new Intl.PluralRules(intl);

  const num = (n: number, o?: Intl.NumberFormatOptions) => n.toLocaleString(intl, o);
  const t = (key: StringKey, vars?: Vars) => interpolate(String(lookup(m, key) ?? key), vars);
  const tn = (key: PluralKey, n: number, vars?: Vars) => {
    const set = lookup(m, key) as Plural | undefined;
    if (!set) return key;
    const forms = set as unknown as Record<string, string | undefined>;
    return interpolate(forms[rules.select(n)] ?? set.other, { n: num(n), ...vars });
  };

  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const shortDate = (d: Date | string) => new Date(d).toLocaleDateString(intl, { day: "numeric", month: "short", timeZone: TZ });

  return {
    locale,
    intl,
    m,
    t,
    tn,
    num,
    /** Enum code → display name (falls back to the code itself). */
    label: (code: string | null | undefined) => (code ? (m.enums[code] ?? code) : "—"),
    city: (id: string) => m.geo.cities[id] ?? id,
    country: (code: string) => m.geo.countries[code] ?? code,
    km: (n: number | null | undefined) => (n == null ? "—" : `${num(Math.round(n))} ${m.units.km}`),
    tonnes: (kg: number) => `${num(kg / 1000, { maximumFractionDigits: 1 })} ${m.units.tonnes}`,
    usd: (n: number | null | undefined, digits = 0) =>
      n == null || Number.isNaN(n) ? "—" : `${n < 0 ? "−" : ""}$${num(Math.abs(n), { minimumFractionDigits: digits, maximumFractionDigits: digits })}`,
    perKm: (n: number | null | undefined) => (n == null ? "—" : `$${num(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${m.units.perKm}`),
    money: (amount: number, currency: string) => {
      if (currency === "USD") return `$${num(amount, { maximumFractionDigits: 0 })}`;
      const v = num(amount, { maximumFractionDigits: 0 });
      return currency === "UZS" ? `${v} UZS` : `${SYMBOL[currency] ?? ""}${v}`;
    },
    shortDate,
    dateTime: (d: Date | string) => new Date(d).toLocaleString(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }),
    relativeDay: (d: Date | string) => {
      const date = new Date(d);
      const v = dayKey(date);
      if (v === dayKey(new Date())) return m.time.today;
      if (v === dayKey(new Date(Date.now() + 86_400_000))) return m.time.tomorrow;
      return shortDate(date);
    },
    ago: (d: Date | string, now = Date.now()) => {
      const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
      if (s < 60) return m.time.justNow;
      const min = Math.round(s / 60);
      if (min < 60) return interpolate(m.time.minAgo, { n: min });
      const h = Math.round(min / 60);
      if (h < 24) return interpolate(m.time.hourAgo, { n: h });
      return tn("time.dayAgo", Math.round(h / 24));
    },
  };
}

export type I18n = ReturnType<typeof createI18n>;
