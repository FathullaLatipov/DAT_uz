"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { buttonClass } from "./ui/primitives";

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
    <button type="button" onClick={toggle} className={buttonClass("ghost", "icon", className)} aria-label={t("common.toggleDark")}>
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </button>
  );
}
