"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";

const EXAMPLES = [
  "20 ton refrigerated load from Tashkent to Kazakhstan next week",
  "Profitable load from Samarkand tomorrow",
  "Fergana to Moscow, at least $1.2/km",
];

/** Natural-language search: text → structured filters (server) → load board URL. */
export function NlSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function run(text: string) {
    if (!text.trim()) return;
    setPending(true);
    setHint(null);
    try {
      const r = await apiCall<{ url: string; understood: string[] }>("/api/nl-search", "POST", { q: text });
      setHint(r.understood.length ? r.understood.join(" · ") : null);
      router.push(r.url);
      ref.current?.blur();
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("relative max-w-xl", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        role="search"
      >
        <label htmlFor="nl-search" className="sr-only">Search loads in plain language</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          id="nl-search"
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder="Search loads, e.g. Tashkent → Almaty 20 t"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-16 text-sm outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-subtle">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <kbd className="hidden rounded border border-border px-1.5 text-xs sm:inline">Ctrl K</kbd>}
        </span>
      </form>
      {focus && !q && (
        <div className="absolute inset-x-0 top-11 z-40 animate-fade-up rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-brand" /> Try natural language
          </div>
          {EXAMPLES.map((e) => (
            <button key={e} onMouseDown={() => (setQ(e), run(e))} className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2">
              {e}
            </button>
          ))}
        </div>
      )}
      {hint && !focus && <div className="absolute left-0 top-10 hidden truncate text-xs text-muted sm:block">Understood: {hint}</div>}
    </div>
  );
}
