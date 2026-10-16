import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Star } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db, parseJson } from "@/server/db";
import { filtersToParams, type LoadFilters } from "@/server/services/filters";
import { notifierStatus } from "@/server/services/alerts";
import { getI18n } from "@/i18n/server";
import type { I18n } from "@/i18n/create";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { SavedSearchControls } from "@/components/loads/saved-search-controls";
import { RouteLabel } from "@/components/loads/parts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.saved") };
}

function describe(f: LoadFilters, i: I18n) {
  const { t, label, city, country, perKm } = i;
  const parts = [
    f.origin ? city(f.origin) : f.originCountry ? country(f.originCountry) : t("catalog.anywhereFrom"),
    "→",
    f.dest ? city(f.dest) : f.destCountry ? country(f.destCountry) : t("catalog.anywhereTo"),
  ].join(" ");
  const extra = [
    f.weightMin && t("saved.weight", { n: f.weightMin / 1000 }),
    f.body?.map(label).join("/"),
    f.cargo?.map(label).join("/"),
    f.ratePerKmMin && t("saved.minRate", { rate: perKm(f.ratePerKmMin) }),
    f.minScore && t("saved.score", { n: f.minScore }),
  ].filter(Boolean);
  return { route: parts, extra: extra.join(" · ") };
}

export default async function SavedPage() {
  const s = await requireSession();
  const i18n = await getI18n();
  const { t, ago, relativeDay, usd, label } = i18n;
  const [searches, favorites] = await Promise.all([
    db.savedSearch.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "desc" } }),
    db.favorite.findMany({ where: { userId: s.userId }, include: { offer: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const channels = notifierStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t("saved.title")} subtitle={t("saved.subtitle")} />
      <Card className="overflow-hidden">
        <CardHeader title={t("saved.searches")} />
        {searches.length === 0 ? (
          <EmptyState icon={<Bookmark className="h-5 w-5" />} title={t("saved.emptyTitle")} body={t("saved.emptyBody", { action: t("board.saveAlert") })} actions={<LinkButton href="/app/loads">{t("saved.openBoard")}</LinkButton>} />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {searches.map((ss) => {
              const f = parseJson<LoadFilters>(ss.filters, {});
              const d = describe(f, i18n);
              return (
                <li key={ss.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/app/loads?${filtersToParams(f).toString()}`} className="font-medium hover:underline">{ss.name}</Link>
                    <div className="text-sm text-muted">{d.route}{d.extra && ` · ${d.extra}`}</div>
                    <div className="text-xs text-subtle">{t("saved.lastChecked", { ago: ago(ss.lastCheckedAt) })}</div>
                  </div>
                  <SavedSearchControls id={ss.id} channels={parseJson(ss.channels, ["WEB"])} available={channels} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={t("saved.loads")} />
        {favorites.length === 0 ? (
          <EmptyState icon={<Star className="h-5 w-5" />} title={t("saved.noLoads")} body={t("saved.noLoadsBody")} />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {favorites.map((f) => (
              <li key={f.id}>
                <Link href={`/app/loads/${f.offer.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                  <div className="min-w-0">
                    <RouteLabel origin={f.offer.originCityId} dest={f.offer.destCityId} size="sm" />
                    <div className="text-xs text-muted">{relativeDay(f.offer.loadingDate)} · {f.offer.status === "ACTIVE" ? t("saved.active") : <span className="text-warn">{label(f.offer.status).toLowerCase()}</span>}</div>
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
