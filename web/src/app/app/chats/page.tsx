import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { getI18n } from "@/i18n/server";
import { threadsFor } from "@/server/services/chat";
import { ChatView } from "@/components/chat/chat-view";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("chat.title") };
}

/** Conversations about loads: the list on the left, the open chat on the right (one at a time on a phone). */
export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const s = await requireSession();
  const { t, city, shortDate, ago } = await getI18n();
  const threads = await threadsFor(s.orgId);
  const wanted = (await searchParams).t;
  const current = threads.find((x) => x.id === wanted)?.id ?? (wanted ? wanted : null);

  const list = (
    <Card className={cn("overflow-hidden lg:block", current && "hidden")}>
      {threads.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-5 w-5" />} title={t("chat.empty")} body={t("chat.emptyBody")} />
      ) : (
        <ul className="divide-y divide-border">
          {threads.map((x) => (
            <li key={x.id}>
              <Link href={`/app/chats?t=${x.id}`} aria-current={x.id === current ? "page" : undefined} className={cn("block px-4 py-3 transition-colors hover:bg-surface-2/70", x.id === current && "bg-brand-soft/50")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{x.peerName}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{x.last ? ago(x.last.at) : ""}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  {city(x.offer.originCityId)} <ArrowRight className="h-3 w-3" aria-hidden /> {city(x.offer.destCityId)} · {shortDate(x.offer.loadingDate)}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <span className={cn("truncate", x.unread ? "font-medium text-fg" : "text-muted")}>{x.last ? `${x.last.mine ? `${t("chat.you")}: ` : ""}${x.last.body}` : ""}</span>
                  {x.unread > 0 && <span className="num shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">{x.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title={t("chat.title")} subtitle={t("chat.subtitle")} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {list}
        <Card className={cn("h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden lg:block", !current && "hidden")}>
          {current ? (
            <div className="flex h-full flex-col">
              <Link href="/app/chats" className="shrink-0 border-b border-border px-4 py-2 text-xs text-brand hover:underline lg:hidden">← {t("chat.back")}</Link>
              <div className="min-h-0 flex-1"><ChatView key={current} threadId={current} /></div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">{t("chat.pick")}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
