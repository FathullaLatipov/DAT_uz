import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { getI18n } from "@/i18n/server";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { BrokerVerifyButton } from "@/components/admin/admin-row-actions";
import { Badge, Card, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("av.brokersTitle") };
}

export default async function BrokersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; unverified?: string }> }) {
  const s = await requireSession();
  if (!can(s, "platform:admin")) redirect("/app");
  const { q = "", unverified } = await searchParams;
  const { t } = await getI18n();
  const query = q.trim();
  const [pending, brokers] = await Promise.all([
    db.verificationRequest.count({ where: { status: "PENDING" } }),
    db.broker.findMany({
      where: {
        ...(unverified ? { verified: false } : {}),
        ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { taxId: { contains: query } }] } : {}),
      },
      orderBy: [{ offers: { _count: "desc" } }],
      take: 100,
      include: { _count: { select: { reviews: true } }, offers: { where: { status: "ACTIVE" }, select: { id: true }, take: 500 } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader title={t("av.brokersTitle")} subtitle={t("av.brokersSub")} />
      <AdminTabs active="brokers" pending={pending} />

      <form className="flex flex-wrap items-center gap-3" action="/app/admin/brokers">
        <input name="q" defaultValue={query} placeholder={t("av.search")} className="h-9 w-72 max-w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="unverified" value="1" defaultChecked={!!unverified} className="h-4 w-4 accent-[var(--brand)]" /> {t("av.onlyUnverified")}
        </label>
        <button className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:brightness-110">OK</button>
        {(query || unverified) && <Link href="/app/admin/brokers" className="text-sm text-muted hover:text-fg">×</Link>}
      </form>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">{t("av.colName")}</th>
              <th className="px-3 py-2 font-medium">{t("av.colTax")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("av.colLoads")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("av.colReviews")}</th>
              <th className="px-3 py-2 font-medium">{t("av.colState")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {brokers.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2.5 font-medium"><Link href={`/app/brokers/${b.id}`} className="hover:underline">{b.name}</Link> {b.isDemo && <DemoBadge />}</td>
                <td className="px-3 py-2.5 text-muted">{b.taxId ?? "—"}</td>
                <td className="num px-3 py-2.5 text-right">{b.offers.length}</td>
                <td className="num px-3 py-2.5 text-right">{b._count.reviews}</td>
                <td className="px-3 py-2.5"><Badge tone={b.verified ? "pos" : "neutral"} className={cn(!b.verified && "text-muted")}>{b.verified ? t("av.verified") : t("av.unverified")}</Badge></td>
                <td className="px-3 py-2.5 text-right"><BrokerVerifyButton id={b.id} verified={b.verified} /></td>
              </tr>
            ))}
            {brokers.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{t("av.empty")}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
