import { Search } from "lucide-react";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES } from "@/server/domain/enums";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/format";

/** Plain GET form → /catalog. Works without JavaScript. */
export async function SearchBar({ initial, className }: { initial?: Record<string, string | undefined>; className?: string }) {
  const { t, city, country, label } = await getI18n();
  const sel = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]";
  return (
    <form action="/catalog" method="get" role="search" className={cn("grid gap-2 rounded-2xl border border-border bg-surface p-2 shadow-pop sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]", className)}>
      <label className="block">
        <span className="sr-only">{t("search.from")}</span>
        <select name="origin" defaultValue={initial?.origin ?? ""} className={sel}>
          <option value="">{t("search.fromAny")}</option>
          {COUNTRIES.map((c) => (
            <optgroup key={c.code} label={country(c.code)}>
              {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{city(x.id)}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">{t("search.to")}</span>
        <select name="to" defaultValue={initial?.to ?? ""} className={sel}>
          <option value="">{t("search.toAnywhere")}</option>
          <optgroup label={t("search.countries")}>
            {COUNTRIES.map((c) => <option key={c.code} value={`country:${c.code}`}>{t("search.countryAnyCity", { name: country(c.code) })}</option>)}
          </optgroup>
          {COUNTRIES.map((c) => (
            <optgroup key={c.code} label={country(c.code)}>
              {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{city(x.id)}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">{t("search.bodyType")}</span>
        <select name="body" defaultValue={initial?.body ?? ""} className={sel}>
          <option value="">{t("search.anyBody")}</option>
          {BODY_TYPES.map((b) => <option key={b} value={b}>{label(b)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">{t("search.loadingFrom")}</span>
        <input type="date" name="loadingFrom" defaultValue={initial?.loadingFrom ?? ""} className={sel} aria-label={t("search.loadingFrom")} />
      </label>
      <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-medium text-brand-fg transition hover:brightness-110 sm:col-span-2 lg:col-span-1">
        <Search className="h-4 w-4" /> {t("search.find")}
      </button>
    </form>
  );
}
