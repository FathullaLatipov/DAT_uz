import Link from "next/link";
import { Plus } from "lucide-react";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";
import { LinkButton } from "../ui/primitives";

export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Karvon home"><Logo /></Link>
        <nav className="ml-4 hidden gap-5 text-sm text-muted md:flex" aria-label="Main">
          <Link href="/catalog" className="hover:text-fg">All loads</Link>
          <Link href="/#directions" className="hover:text-fg">Directions</Link>
          <Link href="/about" className="hover:text-fg">How it works</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <LinkButton href="/app/post" variant="outline" size="sm" className="hidden sm:inline-flex"><Plus className="h-4 w-4" /> Post a load</LinkButton>
          {signedIn ? <LinkButton href="/app" size="sm">My workspace</LinkButton> : <LinkButton href="/login" size="sm">Sign in</LinkButton>}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo className="text-fg" />
        <div className="flex flex-wrap gap-4">
          <Link href="/catalog" className="hover:text-fg">All loads</Link>
          <Link href="/about" className="hover:text-fg">How it works</Link>
          <Link href="/app/post" className="hover:text-fg">Post a load</Link>
        </div>
        <span>© {new Date().getFullYear()} Karvon · Tashkent</span>
      </div>
    </footer>
  );
}
