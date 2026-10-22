"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <button type="button" onClick={toggle} className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:h-11 sm:w-11", className)} aria-label={t("common.toggleDark")}>
      <Sun className="hidden h-[22px] w-[22px] dark:block" strokeWidth={1.9} />
      <Moon className="h-[22px] w-[22px] dark:hidden" strokeWidth={1.9} />
    </button>
  );
}
