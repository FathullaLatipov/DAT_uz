import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Repeat, Search, Sparkles } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ago, cn } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

const ICON = { BACKHAUL: Repeat, SAVED_SEARCH: Search, NEW_MATCH: Sparkles, SYSTEM: Bell } as const;

export default async function NotificationsPage() {
  const s = await requireSession();
  const items = await db.notification.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  // Opening the page marks everything read.
  await db.notification.updateMany({ where: { userId: s.userId, readAt: null }, data: { readAt: new Date() } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" />
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title="You're all caught up" body="Alerts for saved searches and return loads will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const I = ICON[n.type as keyof typeof ICON] ?? Bell;
              const body = (
                <div className={cn("flex gap-3 px-4 py-3.5 sm:px-5", !n.readAt && "bg-brand-soft/30")}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-brand"><I className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-xs text-subtle">{ago(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted">{n.body}</p>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-2">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
