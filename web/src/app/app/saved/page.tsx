import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Star } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db, parseJson } from "@/server/db";
import { filtersToParams, type LoadFilters } from "@/server/services/filters";
import { notifierStatus } from "@/server/services/alerts";
import { getCity, countryName } from "@/server/domain/geo";
import { label } from "@/server/domain/enums";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { SavedSearchControls } from "@/components/loads/saved-search-controls";
import { RouteLabel } from "@/components/loads/parts";
import { ago, perKm, relativeDay, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Saved & alerts" };

function describe(f: LoadFilters) {
  const parts = [
    f.origin ? getCity(f.origin)?.name : f.originCountry ? countryName(f.originCountry) : "Anywhere",
    "→",
    f.dest ? getCity(f.dest)?.name : f.destCountry ? countryName(f.destCountry) : "anywhere",
  ].join(" ");
  const extra = [
    f.weightMin && `${f.weightMin / 1000} t+`,
    f.body?.map(label).join("/"),
    f.cargo?.map(label).join("/"),
    f.ratePerKmMin && `min ${perKm(f.ratePerKmMin)}`,
    f.minScore && `score ${f.minScore}+`,
  ].filter(Boolean);
  return { route: parts, extra: extra.join(" · ") };
}

export default async function SavedPage() {
  const s = await requireSession();
  const [searches, favorites] = await Promise.all([
    db.savedSearch.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "desc" } }),
    db.favorite.findMany({ where: { userId: s.userId }, include: { offer: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const channels = notifierStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Saved searches & alerts" subtitle="We check saved searches for new matching loads and notify you on the channels you choose." />
      <Card className="overflow-hidden">
        <CardHeader title="Saved searches" />
        {searches.length === 0 ? (
          <EmptyState icon={<Bookmark className="h-5 w-5" />} title="No saved searches yet" body="Filter the load board and press “Save & alert” to get notified about new matching loads." actions={<LinkButton href="/app/loads">Open load board</LinkButton>} />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {searches.map((ss) => {
              const f = parseJson<LoadFilters>(ss.filters, {});
              const d = describe(f);
              return (
                <li key={ss.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/app/loads?${filtersToParams(f).toString()}`} className="font-medium hover:underline">{ss.name}</Link>
                    <div className="text-sm text-muted">{d.route}{d.extra && ` · ${d.extra}`}</div>
                    <div className="text-xs text-subtle">Last checked {ago(ss.lastCheckedAt)}</div>
                  </div>
                  <SavedSearchControls id={ss.id} channels={parseJson(ss.channels, ["WEB"])} available={channels} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Saved loads" />
        {favorites.length === 0 ? (
          <EmptyState icon={<Star className="h-5 w-5" />} title="No saved loads" body="Tap the star on any load to keep it here." />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {favorites.map((f) => (
              <li key={f.id}>
                <Link href={`/app/loads/${f.offer.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                  <div className="min-w-0">
                    <RouteLabel origin={f.offer.originCityId} dest={f.offer.destCityId} size="sm" />
                    <div className="text-xs text-muted">{relativeDay(f.offer.loadingDate)} · {f.offer.status === "ACTIVE" ? "active" : <span className="text-warn">{f.offer.status.toLowerCase()}</span>}</div>
                  </div>
                  <span className="num font-semibold">{usd(f.offer.rateUsd)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
