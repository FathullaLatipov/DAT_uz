import Link from "next/link";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getI18n } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link href="/" aria-label={t("auth.homeAria")}>
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">{t("auth.tagline")}</p>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            <li>• {t("auth.bullet1")}</li>
            <li>• {t("auth.bullet2")}</li>
            <li>• {t("auth.bullet3")}</li>
          </ul>
        </div>
        <p className="text-xs text-subtle">{t("auth.builtFor")}</p>
      </aside>
      <main className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4 flex items-center gap-1 sm:right-6">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden" aria-label={t("auth.homeAria")}>
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
