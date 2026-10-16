import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { filtersFromParams, filtersToParams } from "@/server/services/filters";
import { PUBLIC_SORTS, publicSearch, type PublicSort } from "@/server/services/catalog";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES } from "@/server/domain/enums";
import { getI18n } from "@/i18n/server";
import { PublicFooter, PublicHeader } from "@/components/public/public-header";
import { SearchBar } from "@/components/public/search-bar";
import { CatalogTable } from "@/components/public/catalog-table";
import { CatalogTileList } from "@/components/public/catalog-tile-list";
import { EmptyState, LinkButton } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.meta.catalogTitle, description: m.meta.catalogDescription };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SORT_KEY = { newest: "sortNewest", loading: "sortLoading", rate: "sortRate", ratePerKm: "sortRatePerKm", distance: "sortDistance" } as const;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t, tn, label, city, country } = await getI18n();
  // The home search sends "to" as either a city id or "country:XX".
  const to = one(sp.to);
  const params: SP = { ...sp };
  if (to?.startsWith("country:")) params.destCountry = to.slice(8);
  else if (to) params.dest = to;
  const f = filtersFromParams(params);
  const sort = (PUBLIC_SORTS as readonly string[]).includes(one(sp.sort) ?? "") ? (one(sp.sort) as PublicSort) : "newest";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const scope = one(sp.scope);
  const [session, res] = await Promise.all([getSession(), publicSearch(f, sort, page, 24, scope)]);
  const navKey = `${filtersToParams(f).toString()}-${sort}-${page}-${scope ?? ""}`;

  const title =
    f.origin || f.dest || f.originCountry || f.destCountry
      ? `${f.origin ? city(f.origin) : f.originCountry ? country(f.originCountry) : t("catalog.anywhereFrom")} → ${f.dest ? city(f.dest) : f.destCountry ? country(f.destCountry) : t("catalog.anywhereTo")}`
      : scope === "transit" ? t("catalog.transitTitle") : t("catalog.allTitle");

  const href = (patch: Record<string, string | null>) => {
    const p = filtersToParams(f);
    if (sort !== "newest") p.set("sort", sort);
    if (scope) p.set("scope", scope);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/catalog?${p.toString()}`;
  };

  const facets = (
    <>
      <Facet title={t("catalog.truckBody")} items={BODY_TYPES.map((b) => ({ key: b, label: label(b), href: href({ body: f.body?.includes(b) ? null : b, page: null }), active: !!f.body?.includes(b) }))} />
      <Facet title={t("catalog.cargo")} items={CARGO_TYPES.map((c) => ({ key: c, label: label(c), href: href({ cargo: f.cargo?.includes(c) ? null : c, page: null }), active: !!f.cargo?.includes(c) }))} />
      <Facet title={t("catalog.destCountry")} items={COUNTRIES.map((c) => ({ key: c.code, label: country(c.code), href: href({ destCountry: f.destCountry === c.code ? null : c.code, dest: null, page: null }), active: f.destCountry === c.code }))} />
      <Facet title={t("catalog.originCity")} items={CITIES.filter((c) => c.country === "UZ").map((c) => ({ key: c.id, label: city(c.id), href: href({ origin: f.origin === c.id ? null : c.id, page: null }), active: f.origin === c.id }))} />
      <Link href="/catalog" className="inline-block text-xs text-brand hover:underline">{t("catalog.clearFilters")}</Link>
    </>
  );

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!session} />
      <div className="border-b border-border bg-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <SearchBar initial={{ origin: f.origin, to: f.dest ?? (f.destCountry ? `country:${f.destCountry}` : undefined), body: f.body?.[0], loadingFrom: f.loadingFrom }} className="shadow-none" />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <nav className="text-xs text-muted" aria-label={t("catalog.breadcrumb")}><Link href="/" className="hover:text-fg">{t("common.home")}</Link> / <span>{t("common.loads")}</span></nav>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="num text-sm text-muted">{tn("catalog.activeLoads", res.total)}</p>
          </div>
          <div className="flex flex-wrap gap-1 text-sm" role="group" aria-label={t("catalog.sortAria")}>
            {PUBLIC_SORTS.map((s) => (
              <Link key={s} href={href({ sort: s === "newest" ? null : s, page: null })} className={cn("rounded-lg px-2.5 py-1.5", s === sort ? "bg-surface-2 font-medium" : "text-muted hover:text-fg")}>{t(`catalog.${SORT_KEY[s]}`)}</Link>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          {/* Facets */}
          {/* Mobile: facets collapse behind "Filters"; desktop: always-visible sidebar. */}
          <details className="group/f rounded-xl border border-border bg-surface p-3 lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-medium">{t("catalog.filters")}</summary>
            <div className="mt-3 space-y-5 text-sm">{facets}</div>
          </details>
          <aside className="hidden space-y-5 text-sm lg:block">{facets}
          </aside>

          <div className="min-w-0">
            {res.items.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface">
                <EmptyState icon={<PackageSearch className="h-5 w-5" />} title={t("catalog.noLoads")} body={t("catalog.noLoadsBody")} actions={<LinkButton href="/catalog" variant="outline">{t("catalog.showAll")}</LinkButton>} />
              </div>
            ) : (
              <>
                <CatalogTable key={`t-${navKey}`} items={res.items} />
                <CatalogTileList key={`m-${navKey}`} items={res.items} className="grid gap-3 sm:grid-cols-2 md:hidden" />
              </>
            )}
            {res.pages > 1 && (
              <nav className="mt-6 flex items-center justify-between text-sm" aria-label={t("catalog.pagination")}>
                <span className="text-muted">{t("catalog.pageOf", { page, pages: res.pages })}</span>
                <div className="flex gap-2">
                  {page > 1 && <LinkButton variant="outline" size="sm" href={href({ page: String(page - 1) })}>{t("catalog.previous")}</LinkButton>}
                  {page < res.pages && <LinkButton variant="outline" size="sm" href={href({ page: String(page + 1) })}>{t("catalog.next")}</LinkButton>}
                </div>
              </nav>
            )}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function Facet({ title, items }: { title: string; items: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <details open className="group">
      <summary className="mb-2 cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted">{title}</summary>
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
        {items.map((i) => (
          <Link key={i.key} href={i.href} aria-current={i.active ? "true" : undefined}
            className={cn("rounded-md px-2 py-1 lg:-mx-2", i.active ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-fg", "border border-border lg:border-0")}>
            {i.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
