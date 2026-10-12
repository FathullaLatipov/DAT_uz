import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">More loaded kilometers. Less empty driving. Better profit.</p>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            <li>• Loads ranked for <em>your</em> trucks, location and costs</li>
            <li>• Every score explained — never a black box</li>
            <li>• Return loads found before your truck arrives</li>
          </ul>
        </div>
        <p className="text-xs text-subtle">Built for carriers in Uzbekistan and Central Asia.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden" aria-label="Home">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
