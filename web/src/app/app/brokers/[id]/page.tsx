import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Info } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { brokerReliability } from "@/server/services/broker";
import { countryName } from "@/server/domain/geo";
import { Badge, Bar, Card, CardHeader, DemoBadge, PageHeader, Stat } from "@/components/ui/primitives";
import { RouteLabel } from "@/components/loads/parts";
import { relativeDay, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Broker" };

export default async function BrokerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [b, rel] = await Promise.all([
    db.broker.findUnique({
      where: { id },
      include: {
        offers: { where: { status: "ACTIVE" }, orderBy: { loadingDate: "asc" }, take: 10 },
        _count: { select: { offers: true } },
      },
    }),
    brokerReliability(id),
  ]);
  if (!b || !rel) notFound();
  const sources = await db.freightListing.groupBy({ by: ["sourceId"], where: { offer: { brokerId: id } }, _count: true });
  const sourceNames = await db.freightSource.findMany({ where: { id: { in: sources.map((s) => s.sourceId) } } });

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/loads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <PageHeader
        title={b.name}
        subtitle={b.countryCode ? countryName(b.countryCode) : undefined}
        badge={<span className="flex gap-1.5">{b.verified ? <Badge tone="pos"><BadgeCheck className="h-3 w-3" /> Verified</Badge> : <Badge>Not verified</Badge>}{b.isDemo && <DemoBadge />}</span>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Reliability score" />
            <div className="px-4 pb-5 sm:px-5">
              {rel.sufficient ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="num text-4xl font-semibold">{rel.score}</span>
                    <span className="text-muted">/ 100</span>
                  </div>
                  <div className="mt-5 space-y-3">
                    {rel.components.map((c) => (
                      <div key={c.key}>
                        <div className="mb-1 flex justify-between text-sm"><span>{c.label}</span><span className="num text-muted">{c.points} / {c.max}</span></div>
                        <Bar value={(c.points / c.max) * 100} tone={c.points / c.max >= 0.75 ? "pos" : c.points / c.max >= 0.5 ? "warn" : "neg"} />
                        <div className="mt-0.5 text-xs text-subtle">{c.detail}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="flex gap-2 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0" />No score yet.</p>
              )}
              <p className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-muted"><strong className="text-fg">How this is calculated: </strong>{rel.explanation}</p>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Active loads from this broker" />
            {b.offers.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No active loads right now.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {b.offers.map((o) => (
                  <li key={o.id}>
                    <Link href={`/app/loads/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                      <div><RouteLabel origin={o.originCityId} dest={o.destCityId} size="sm" /><div className="text-xs text-muted">{relativeDay(o.loadingDate)}</div></div>
                      <span className="num font-semibold">{usd(o.rateUsd)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="grid grid-cols-2 gap-5 p-5">
            <Stat label="Reviews" value={rel.reviews} />
            <Stat label="Avg rating" value={rel.avgRating ? `${rel.avgRating.toFixed(1)} ★` : "—"} />
            <Stat label="Paid on time" value={rel.paidOnTimePct != null ? `${rel.paidOnTimePct}%` : "—"} />
            <Stat label="Loads seen" value={b._count.offers} />
            <Stat label="Completed via platform" value={rel.completedTrips} />
            <Stat label="Avg response time" value="—" sub="not tracked yet" />
          </Card>
          <Card>
            <CardHeader title="Seen on sources" />
            <ul className="space-y-1.5 px-5 pb-5 text-sm">
              {sources.map((s) => (
                <li key={s.sourceId} className="flex justify-between"><span>{sourceNames.find((n) => n.id === s.sourceId)?.name ?? s.sourceId}</span><span className="num text-muted">{s._count} listings</span></li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 text-xs text-muted">
            Verification: {b.verificationMethod ?? "not performed"}. We only show metrics computed from data on this platform and never publish unverified claims about a company.
          </Card>
        </div>
      </div>
    </div>
  );
}
