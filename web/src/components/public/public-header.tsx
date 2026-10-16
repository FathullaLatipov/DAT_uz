import Link from "next/link";
import { Plus } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { LanguageSwitcher } from "../language-switcher";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";
import { LinkButton } from "../ui/primitives";

export async function PublicHeader({ signedIn }: { signedIn: boolean }) {
  const { t } = await getI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={t("nav.homeAria")}><Logo /></Link>
        <nav className="ml-4 hidden gap-5 text-sm text-muted md:flex" aria-label={t("nav.main")}>
          <Link href="/catalog" className="hover:text-fg">{t("nav.allLoads")}</Link>
          <Link href="/#directions" className="hover:text-fg">{t("nav.directions")}</Link>
          <Link href="/#how" className="hover:text-fg">{t("nav.howItWorks")}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
          <LinkButton href="/app/post" variant="outline" size="sm" className="hidden sm:inline-flex"><Plus className="h-4 w-4" /> {t("nav.postLoad")}</LinkButton>
          {signedIn ? <LinkButton href="/app" size="sm">{t("common.myWorkspace")}</LinkButton> : <LinkButton href="/login" size="sm">{t("common.signIn")}</LinkButton>}
        </div>
      </div>
    </header>
  );
}

export async function PublicFooter() {
  const { t } = await getI18n();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo className="text-fg" />
        <div className="flex flex-wrap gap-4">
          <Link href="/catalog" className="hover:text-fg">{t("nav.allLoads")}</Link>
          <Link href="/#how" className="hover:text-fg">{t("nav.howItWorks")}</Link>
          <Link href="/app/post" className="hover:text-fg">{t("nav.postLoad")}</Link>
        </div>
        <span>{t("footer.rights", { year: new Date().getFullYear() })}</span>
      </div>
    </footer>
  );
}
