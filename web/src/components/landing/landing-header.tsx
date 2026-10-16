import Link from "next/link";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";
import { LinkButton } from "../ui/primitives";

/** Landing-page header: anchors scroll to sections of this page; the CTA always leads somewhere useful. */
export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Karvon home"><Logo /></Link>
        <nav className="ml-4 hidden gap-5 text-sm text-muted lg:flex" aria-label="Sections">
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="#features" className="hover:text-fg">Features</a>
          <a href="#audience" className="hover:text-fg">Who it&apos;s for</a>
          <a href="#directions" className="hover:text-fg">Live loads</a>
          <a href="#faq" className="hover:text-fg">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <LinkButton href="/catalog" variant="ghost" size="sm" className="hidden sm:inline-flex">Browse loads</LinkButton>
          {signedIn ? (
            <LinkButton href="/app" size="sm">My workspace</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="outline" size="sm" className="hidden sm:inline-flex">Sign in</LinkButton>
              <LinkButton href="/signup" size="sm">Get started</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
