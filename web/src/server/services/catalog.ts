import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demoOfferFilter } from "../domain/demo";
import { countryName, getCity } from "../domain/geo";
import { buildWhere, offerInclude, type OfferWithRels } from "./freight";
import type { LoadFilters } from "./filters";

/**
 * Public marketplace catalog: directions as "categories", routes as "products",
 * loads as listings. Everything is computed from active offers in the database.
 */

/** Set PUBLIC_HIDE_DEMO=1 once real sources are live to keep demo listings off public pages. */
export const publicWhere = (): Prisma.FreightOfferWhereInput => ({ status: "ACTIVE", ...demoOfferFilter() });

export const routeSlug = (o: string, d: string) => `${o}--${d}`;
export const parseRouteSlug = (slug: string) => {
  const [o, d] = slug.split("--");
  return getCity(o) && getCity(d) ? { o, d } : null;
};

export interface RouteSummary {
  slug: string;
  origin: string;
  dest: string;
  loads: number;
  minRateUsd: number | null;
  medianPerKm: number | null;
  nextLoading: Date | null;
  distanceKm: number;
}

export interface Direction {
  key: string;
  title: string;
  subtitle: string;
  country: string; // tag shown on the tile
  loads: number;
  minRateUsd: number | null;
  routes: RouteSummary[];
  href: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Rates the data-quality layer flagged as implausible are never shown or aggregated. */
export const rateIsTrusted = (o: { rateUsd: number; qualityFlags: string }) => o.rateUsd > 0 && !o.qualityFlags.includes("SUSPICIOUS_RATE");

function summarize(list: { originCityId: string; destCityId: string; rateUsd: number; qualityFlags: string; distanceKm: number; loadingDate: Date }[]): RouteSummary[] {
  const by = new Map<string, typeof list>();
  for (const o of list) {
    const k = routeSlug(o.originCityId, o.destCityId);
    (by.get(k) ?? by.set(k, []).get(k)!).push(o);
  }
  return [...by.entries()]
    .map(([slug, xs]) => {
      const priced = xs.filter(rateIsTrusted);
      return {
        slug,
        origin: xs[0].originCityId,
        dest: xs[0].destCityId,
        loads: xs.length,
        minRateUsd: priced.length ? Math.min(...priced.map((x) => x.rateUsd)) : null,
        medianPerKm: median(priced.map((x) => x.rateUsd / x.distanceKm)),
        nextLoading: xs.reduce<Date | null>((a, x) => (!a || x.loadingDate < a ? x.loadingDate : a), null),
        distanceKm: xs[0].distanceKm,
      };
    })
    .sort((a, b) => b.loads - a.loads);
}

export async function catalogOverview() {
  const offers = await db.freightOffer.findMany({
    where: publicWhere(),
    select: { originCityId: true, destCityId: true, originCountry: true, destCountry: true, rateUsd: true, qualityFlags: true, distanceKm: true, loadingDate: true, isDemo: true },
  });

  const domestic = offers.filter((o) => o.originCountry === "UZ" && o.destCountry === "UZ");
  const exports = offers.filter((o) => o.originCountry === "UZ" && o.destCountry !== "UZ");
  const imports = offers.filter((o) => o.originCountry !== "UZ" && o.destCountry === "UZ");
  const transit = offers.filter((o) => o.originCountry !== "UZ" && o.destCountry !== "UZ");

  const minRate = (xs: typeof offers) => {
    const p = xs.filter(rateIsTrusted).map((x) => x.rateUsd);
    return p.length ? Math.min(...p) : null;
  };
  const group = (xs: typeof offers, key: "destCountry" | "originCountry") => {
    const m = new Map<string, typeof offers>();
    for (const o of xs) (m.get(o[key]) ?? m.set(o[key], []).get(o[key])!).push(o);
    return m;
  };

  const directions: Direction[] = [];
  if (domestic.length)
    directions.push({
      key: "domestic", title: "Across Uzbekistan", subtitle: "Domestic routes", country: "UZ",
      loads: domestic.length, minRateUsd: minRate(domestic), routes: summarize(domestic), href: "/catalog?originCountry=UZ&destCountry=UZ",
    });
  for (const [c, xs] of [...group(exports, "destCountry")].sort((a, b) => b[1].length - a[1].length))
    directions.push({
      key: `to-${c}`, title: `To ${countryName(c)}`, subtitle: "Export from Uzbekistan", country: c,
      loads: xs.length, minRateUsd: minRate(xs), routes: summarize(xs), href: `/catalog?originCountry=UZ&destCountry=${c}`,
    });
  for (const [c, xs] of [...group(imports, "originCountry")].sort((a, b) => b[1].length - a[1].length))
    directions.push({
      key: `from-${c}`, title: `From ${countryName(c)}`, subtitle: "Import to Uzbekistan", country: c,
      loads: xs.length, minRateUsd: minRate(xs), routes: summarize(xs), href: `/catalog?originCountry=${c}&destCountry=UZ`,
    });
  if (transit.length)
    directions.push({
      key: "transit", title: "Other international", subtitle: "Not via Uzbekistan", country: "INT",
      loads: transit.length, minRateUsd: minRate(transit), routes: summarize(transit), href: "/catalog?scope=transit",
    });

  return {
    directions,
    popularRoutes: summarize(offers).slice(0, 12),
    totals: {
      loads: offers.length,
      routes: new Set(offers.map((o) => routeSlug(o.originCityId, o.destCityId))).size,
      countries: new Set(offers.flatMap((o) => [o.originCountry, o.destCountry])).size,
      demoShare: offers.length ? offers.filter((o) => o.isDemo).length / offers.length : 0,
    },
  };
}

export const PUBLIC_SORTS = ["newest", "loading", "rate", "ratePerKm", "distance"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

const ORDER: Record<PublicSort, Prisma.FreightOfferOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  loading: [{ loadingDate: "asc" }],
  rate: [{ rateUsd: "desc" }],
  ratePerKm: [{ rateUsd: "desc" }], // refined in memory below
  distance: [{ distanceKm: "asc" }],
};

export async function publicSearch(f: LoadFilters, sort: PublicSort, page: number, pageSize = 24, scope?: string) {
  const where = buildWhere(f);
  (where.AND as Prisma.FreightOfferWhereInput[]).push(publicWhere());
  if (scope === "transit") (where.AND as Prisma.FreightOfferWhereInput[]).push({ NOT: { originCountry: "UZ" } }, { NOT: { destCountry: "UZ" } });
  const [total, rows] = await Promise.all([
    db.freightOffer.count({ where }),
    db.freightOffer.findMany({ where, include: offerInclude, orderBy: ORDER[sort], ...(sort === "ratePerKm" ? {} : { skip: (page - 1) * pageSize, take: pageSize }) }),
  ]);
  let items: OfferWithRels[] = rows;
  if (sort === "ratePerKm") items = rows.sort((a, b) => b.rateUsd / b.distanceKm - a.rateUsd / a.distanceKm).slice((page - 1) * pageSize, page * pageSize);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function latestLoads(n = 8) {
  return db.freightOffer.findMany({ where: publicWhere(), include: offerInclude, orderBy: { createdAt: "desc" }, take: n });
}
