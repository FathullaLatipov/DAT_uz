import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./config";
import { createI18n } from "./create";
import { MESSAGES } from "./messages";

/**
 * The visitor's language: an explicit choice (cookie set by the language switcher) wins, then the
 * browser's Accept-Language, then English. Reading cookies/headers makes a page dynamic, which
 * every page that shows session or live data already is.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
});

/** Server-component translator: `const { t, label, city } = await getI18n();` */
export const getI18n = cache(async () => {
  const locale = await getLocale();
  return createI18n(locale, MESSAGES[locale]);
});
