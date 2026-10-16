import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { LanguageSwitcher } from "../language-switcher";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";
import { LinkButton } from "../ui/primitives";

/** Landing-page header: anchors scroll to sections of this page; the CTA always leads somewhere useful. */
export async function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const { t } = await getI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={t("nav.homeAria")}><Logo /></Link>
        <nav className="ml-4 hidden gap-5 text-sm text-muted lg:flex" aria-label={t("nav.sections")}>
          <a href="#how" className="hover:text-fg">{t("nav.how")}</a>
          <a href="#features" className="hover:text-fg">{t("nav.features")}</a>
          <a href="#audience" className="hover:text-fg">{t("nav.audience")}</a>
          <a href="#directions" className="hover:text-fg">{t("nav.live")}</a>
          <a href="#faq" className="hover:text-fg">{t("nav.faq")}</a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
          <LinkButton href="/catalog" variant="ghost" size="sm" className="hidden sm:inline-flex">{t("common.browseLoads")}</LinkButton>
          {signedIn ? (
            <LinkButton href="/app" size="sm">{t("common.myWorkspace")}</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="outline" size="sm" className="hidden sm:inline-flex">{t("common.signIn")}</LinkButton>
              <LinkButton href="/signup" size="sm">{t("common.getStarted")}</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
