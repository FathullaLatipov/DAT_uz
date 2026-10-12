import { cn } from "@/lib/format";

/** Karvon mark: two route nodes joined by a loaded leg — "a truck that never runs empty". */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        <rect width="28" height="28" rx="7" fill="var(--brand)" />
        <path d="M7 19.5 L14 8.5 L21 19.5" fill="none" stroke="var(--brand-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="19.5" r="2.2" fill="var(--brand-fg)" />
        <circle cx="21" cy="19.5" r="2.2" fill="var(--brand-fg)" />
      </svg>
      {withText && <span className="text-[17px] font-semibold tracking-tight">Karvon</span>}
    </span>
  );
}
