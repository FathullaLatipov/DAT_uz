"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import { createI18n, type I18n } from "./create";
import type { Messages } from "./messages/en";

const Ctx = createContext<I18n | null>(null);

/**
 * Gives client components the same translator the server components use. Only the active
 * language's messages cross the server→client boundary, once, from the root layout.
 */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => createI18n(locale, messages), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n() needs <I18nProvider> — it is mounted in the root layout.");
  return v;
}
