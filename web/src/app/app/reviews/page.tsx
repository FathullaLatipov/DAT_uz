import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, Star } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { brokerKey } from "@/server/ingestion/normalize";
import { getI18n } from "@/i18n/server";
import { RouteLabel } from "@/components/loads/parts";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("rv.title") };
}

const LIMIT = 50;

type Kind = "fromCarrier" | "fromShipper" | "aboutCarrier" | "aboutShipper";
interface Item {
  id: string;
  kind: Kind;
  name: string;
  rating: number;
  comment: string | null;
  flags: { text: string; tone: "pos" | "warn" | "neg" }[];
  route: { o: string; d: string } | null;
  at: Date;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= rating ? "h-4 w-4 fill-warn text-warn" : "h-4 w-4 text-border"} />)}
    </span>
  );
}

/** Reviews for everyone: what carriers and shippers wrote about this company, and what this company wrote about them. */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireSession();
  const { t, num, dateTime } = await getI18n();
  const tab: "about" | "written" = (await searchParams).tab === "written" ? "written" : "about";
  const key = brokerKey(s.org.name);
  const broker = key ? await db.broker.findUnique({ where: { normalizedName: key }, select: { id: true } }) : null;

  const tripSel = { select: { originCityId: true, destCityId: true } } as const;
  const [fromCarriers, fromShippers, toShippers, toCarriers] = await Promise.all([
    broker ? db.brokerReview.findMany({ where: { brokerId: broker.id, isDemo: false }, orderBy: { createdAt: "desc" }, take: LIMIT, include: { org: { select: { name: true } }, trip: tripSel } }) : Promise.resolve([]),
    db.carrierReview.findMany({ where: { carrierOrgId: s.orgId }, orderBy: { createdAt: "desc" }, take: LIMIT, include: { shipperOrg: { select: { name: true } }, trip: tripSel } }),
    db.brokerReview.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" }, take: LIMIT, include: { broker: { select: { name: true } }, trip: tripSel } }),
    db.carrierReview.findMany({ where: { shipperOrgId: s.orgId }, orderBy: { createdAt: "desc" }, take: LIMIT, include: { carrierOrg: { select: { name: true } }, trip: tripSel } }),
  ]);

  const brokerFlags = (r: { paidOnTime: boolean | null; disputed: boolean; cancelled: boolean }): Item["flags"] => [
    ...(r.paidOnTime === true ? [{ text: t("rv.paidOnTime"), tone: "pos" as const }] : r.paidOnTime === false ? [{ text: t("rv.notPaid"), tone: "warn" as const }] : []),
    ...(r.disputed ? [{ text: t("rv.disputed"), tone: "warn" as const }] : []),
    ...(r.cancelled ? [{ text: t("rv.cancelled"), tone: "neg" as const }] : []),
  ];
  const carrierFlags = (r: { onTime: boolean | null }): Item["flags"] =>
    r.onTime === true ? [{ text: t("rv.onTime"), tone: "pos" }] : r.onTime === false ? [{ text: t("rv.notOnTime"), tone: "warn" }] : [];
  const route = (tr: { originCityId: string; destCityId: string } | null) => (tr ? { o: tr.originCityId, d: tr.destCityId } : null);

  const about: Item[] = [
    ...fromCarriers.map((r): Item => ({ id: r.id, kind: "fromCarrier", name: r.org.name, rating: r.rating, comment: r.comment, flags: brokerFlags(r), route: route(r.trip), at: r.createdAt })),
    ...fromShippers.map((r): Item => ({ id: r.id, kind: "fromShipper", name: r.shipperOrg.name, rating: r.rating, comment: r.comment, flags: carrierFlags(r), route: route(r.trip), at: r.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const written: Item[] = [
    ...toShippers.map((r): Item => ({ id: r.id, kind: "aboutShipper", name: r.broker.name, rating: r.rating, comment: r.comment, flags: brokerFlags(r), route: route(r.trip), at: r.createdAt })),
    ...toCarriers.map((r): Item => ({ id: r.id, kind: "aboutCarrier", name: r.carrierOrg.name, rating: r.rating, comment: r.comment, flags: carrierFlags(r), route: route(r.trip), at: r.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const avg = (xs: { rating: number }[]) => (xs.length ? Math.round((xs.reduce((a, x) => a + x.rating, 0) / xs.length) * 10) / 10 : null);
  const roles = [
    { label: t("rv.asCarrier"), list: fromShippers },
    { label: t("rv.asShipper"), list: fromCarriers },
  ].filter((r) => r.list.length > 0);
  const items = tab === "about" ? about : written;
  const KIND: Record<Kind, string> = { fromCarrier: t("rv.fromCarrier"), fromShipper: t("rv.fromShipper"), aboutCarrier: t("rv.aboutCarrier"), aboutShipper: t("rv.aboutShipper") };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t("rv.title")} subtitle={t("rv.subtitle")} />

      <Card className="p-4 sm:p-5">
        <div className="text-xs text-muted">{t("rv.sumAbout")}</div>
        {roles.length === 0 ? (
          <div className="mt-1 text-sm text-muted">{t("rv.sumNone")}</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-10 gap-y-3">
            {roles.map((r) => (
              <div key={r.label}>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Stars rating={Math.round(avg(r.list) ?? 0)} />
                  <span className="num text-sm font-semibold">{t("rv.sumValue", { avg: num(avg(r.list) ?? 0), n: r.list.length, reviews: r.list.length === 1 ? t("rv.review1") : t("rv.reviewN") })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div role="tablist" aria-label={t("rv.title")} className="inline-flex rounded-xl border border-border bg-surface p-1 text-[15px]">
        {([["about", t("rv.tabAbout"), about.length], ["written", t("rv.tabWritten"), written.length]] as const).map(([k, text, n]) => (
          <Link key={k} href={`/app/reviews?tab=${k}`} role="tab" aria-selected={tab === k}
            className={cn("rounded-lg px-4 py-2 font-medium transition-colors", tab === k ? "bg-brand text-brand-fg" : "text-muted hover:text-fg")}>
            {text} <span className="num ml-1 opacity-80">{n}</span>
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquareText className="h-5 w-5" />} title={tab === "about" ? t("rv.noneAbout") : t("rv.noneWritten")} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">{KIND[r.kind]}</div>
                  <div className="mt-0.5 font-semibold">{tab === "about" ? t("rv.from", { name: r.name }) : t("rv.about", { name: r.name })}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-subtle">{dateTime(r.at)}</span>
                </div>
              </div>
              {r.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">{r.flags.map((f) => <Badge key={f.text} tone={f.tone}>{f.text}</Badge>)}</div>
              )}
              <p className={cn("mt-2 whitespace-pre-line text-sm", !r.comment && "text-muted")}>{r.comment ? `“${r.comment}”` : t("rv.noComment")}</p>
              {r.route && <div className="mt-2"><RouteLabel origin={r.route.o} dest={r.route.d} size="sm" /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
