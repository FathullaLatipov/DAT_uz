import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PostLoadForm } from "@/components/loads/post-load-form";
import { PasteImport } from "@/components/loads/paste-import";
import { CloseLoadButton } from "@/components/loads/close-load-button";
import { RouteLabel } from "@/components/loads/parts";
import { relativeDay, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Post a load" };

export default async function PostPage() {
  const s = await requireSession();
  const mine = await db.freightListing.findMany({
    where: { sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${s.orgId}-` } },
    include: { offer: true },
    orderBy: { firstSeenAt: "desc" },
    take: 30,
  });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Post a load" subtitle={`Published as ${s.org.name}. Your load appears in the public catalog and is matched to suitable trucks.`} />
      <Card className="p-4 sm:p-6">
        <PostLoadForm defaultContact={s.user.name} />
      </Card>
      <Card>
        <CardHeader title="Paste ads" subtitle="Turn copied text into loads automatically" />
        <div className="px-4 pb-5 sm:px-5"><PasteImport /></div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Your posted loads" />
        {mine.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Nothing posted yet.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <Link href={`/load/${l.offerId}`} className="min-w-0 hover:underline">
                  <RouteLabel origin={l.offer.originCityId} dest={l.offer.destCityId} size="sm" />
                  <div className="text-xs text-muted">{relativeDay(l.offer.loadingDate)} · {l.offer.rateUsd > 0 ? usd(l.offer.rateUsd) : "negotiable"}</div>
                </Link>
                <div className="flex items-center gap-2">
                  <Badge tone={l.offer.status === "ACTIVE" ? "pos" : "neutral"}>{l.offer.status === "ACTIVE" ? "Active" : l.offer.status === "BOOKED" ? "Covered" : "Expired"}</Badge>
                  {l.offer.status === "ACTIVE" && <CloseLoadButton id={l.offerId} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
