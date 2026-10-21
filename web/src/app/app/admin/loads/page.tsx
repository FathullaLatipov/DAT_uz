import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { getI18n } from "@/i18n/server";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { LoadVisibilityButton } from "@/components/admin/admin-row-actions";
import { RouteLabel } from "@/components/loads/parts";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("av.loadsTitle") };
}

const PAGE_SIZE = 50;

export default async function PostedLoadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const s = await requireSession();
  if (!can(s, "platform:admin")) redirect("/app");
  const { t, label, ago, tonnes, usd } = await getI18n();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const where = { listings: { some: { sourceId: PLATFORM_SOURCE.id } } };
  const [pending, offers, total] = await Promise.all([
    db.verificationRequest.count({ where: { status: "PENDING" } }),
    db.freightOffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { broker: { select: { name: true, verified: true } } },
    }),
    db.freightOffer.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader title={t("av.loadsTitle")} subtitle={t("av.loadsSub")} />
      <AdminTabs active="loads" pending={pending} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">{t("av.colRoute")}</th>
              <th className="px-3 py-2 font-medium">{t("av.colPoster")}</th>
              <th className="px-3 py-2 font-medium">{t("av.colStatus")}</th>
              <th className="px-3 py-2 font-medium">{t("av.colWhen")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {offers.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2.5">
                  <Link href={`/app/loads/${o.id}`} className="hover:underline"><RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" /></Link>
                  <div className="text-xs text-muted">{tonnes(o.weightKg)} · {label(o.bodyType)}{o.rateUsd > 0 ? ` · ${usd(o.rateUsd)}` : ""}</div>
                </td>
                <td className="px-3 py-2.5">{o.broker?.name ?? "—"} {o.broker?.verified && <Badge tone="pos">{t("av.verified")}</Badge>}</td>
                <td className="px-3 py-2.5"><Badge tone={o.status === "ACTIVE" ? "pos" : "neutral"}>{label(o.status).toLowerCase()}</Badge></td>
                <td className="px-3 py-2.5 text-muted">{ago(o.createdAt)}</td>
                <td className="px-3 py-2.5 text-right">{(o.status === "ACTIVE" || o.status === "EXPIRED") && <LoadVisibilityButton id={o.id} active={o.status === "ACTIVE"} />}</td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t("av.empty")}</td></tr>}
          </tbody>
        </table>
      </Card>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("catalog.pagination")}>
          <span className="text-muted">{t("catalog.pageOf", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && <LinkButton variant="outline" size="sm" href={`/app/admin/loads?page=${page - 1}`}>{t("catalog.previous")}</LinkButton>}
            {page < pages && <LinkButton variant="outline" size="sm" href={`/app/admin/loads?page=${page + 1}`}>{t("catalog.next")}</LinkButton>}
          </div>
        </nav>
      )}
    </div>
  );
}
