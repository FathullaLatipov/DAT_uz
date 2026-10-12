import { Search } from "lucide-react";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, label } from "@/server/domain/enums";
import { cn } from "@/lib/format";

/** Plain GET form → /catalog. Works without JavaScript. */
export function SearchBar({ initial, className }: { initial?: Record<string, string | undefined>; className?: string }) {
  const sel = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]";
  return (
    <form action="/catalog" method="get" role="search" className={cn("grid gap-2 rounded-2xl border border-border bg-surface p-2 shadow-pop sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]", className)}>
      <label className="block">
        <span className="sr-only">From</span>
        <select name="origin" defaultValue={initial?.origin ?? ""} className={sel}>
          <option value="">From: any city</option>
          {COUNTRIES.map((c) => (
            <optgroup key={c.code} label={c.name}>
              {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">To</span>
        <select name="to" defaultValue={initial?.to ?? ""} className={sel}>
          <option value="">To: anywhere</option>
          <optgroup label="Countries">
            {COUNTRIES.map((c) => <option key={c.code} value={`country:${c.code}`}>{c.name} (any city)</option>)}
          </optgroup>
          {COUNTRIES.map((c) => (
            <optgroup key={c.code} label={c.name}>
              {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Body type</span>
        <select name="body" defaultValue={initial?.body ?? ""} className={sel}>
          <option value="">Any truck body</option>
          {BODY_TYPES.map((b) => <option key={b} value={b}>{label(b)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Loading from</span>
        <input type="date" name="loadingFrom" defaultValue={initial?.loadingFrom ?? ""} className={sel} aria-label="Loading from" />
      </label>
      <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-medium text-brand-fg transition hover:brightness-110 sm:col-span-2 lg:col-span-1">
        <Search className="h-4 w-4" /> Find loads
      </button>
    </form>
  );
}
