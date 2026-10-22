"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, LOCALE_META, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";

/**
 * Language menu. The choice is stored in a one-year cookie the server reads on every request, so
 * links never change (/catalog stays /catalog); router.refresh() re-renders the page in place.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    router.refresh();
  }

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:h-11 sm:px-3"
        aria-label={t("common.language")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Globe className="hidden h-[22px] w-[22px] sm:block" strokeWidth={1.9} />
        <span className="text-sm font-semibold">{LOCALE_META[locale].short}</span>
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-12 z-50 w-48 animate-fade-up rounded-2xl border border-border bg-surface p-2 shadow-pop">
          {LOCALES.map((l) => (
            <li key={l} role="none">
              <button
                role="menuitemradio"
                aria-checked={l === locale}
                onClick={() => choose(l)}
                lang={l}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[15px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                {LOCALE_META[l].name}
                {l === locale && <Check className="h-4 w-4 text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
