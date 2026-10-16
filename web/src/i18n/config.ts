export const LOCALES = ["en", "ru", "uz"] as const;
export type Locale = (typeof LOCALES)[number];

/** Used when the visitor has not chosen a language and their browser does not ask for one we have. */
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const LOCALE_META: Record<Locale, { name: string; short: string; intl: string }> = {
  en: { name: "English", short: "EN", intl: "en-GB" },
  ru: { name: "Русский", short: "RU", intl: "ru-RU" },
  uz: { name: "O'zbekcha", short: "UZ", intl: "uz-UZ" },
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/**
 * Picks the best supported language from an Accept-Language header, honouring q-values:
 * "ru-RU,ru;q=0.9,en;q=0.8" → "ru". Anything unsupported falls back to the default.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}
