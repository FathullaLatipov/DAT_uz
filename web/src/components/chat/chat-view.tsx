"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Loader2, Send } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { LoadDetailPanel } from "../loads/load-detail-panel";

interface Msg { id: string; mine: boolean; body: string; at: string }
interface Thread {
  side: "carrier" | "shipper";
  peerName: string;
  offerId: string;
  offer: { originCityId: string; destCityId: string; loadingDate: string; rateUsd: number; weightKg: number; distanceKm: number; status: string };
  messages: Msg[];
}

const POLL_MS = 4000;

/**
 * One conversation about a load. The load is pinned at the top (route, date, rate); pressing it opens everything
 * about the load right inside the chat. New messages arrive by polling every few seconds while the tab is visible.
 */
export function ChatView({ threadId }: { threadId: string }) {
  const { t, city, tonnes, usd, shortDate, dateTime } = useI18n();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLoad, setShowLoad] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const last = useRef<string | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    last.current = incoming[incoming.length - 1].at;
    setThread((cur) => {
      if (!cur) return cur;
      const seen = new Set(cur.messages.map((m) => m.id));
      return { ...cur, messages: [...cur.messages, ...incoming.filter((m) => !seen.has(m.id))] };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    last.current = undefined;
    setThread(null);
    setError(null);
    setShowLoad(false);
    apiCall<Thread>(`/api/chats/${threadId}`, "GET")
      .then((d) => {
        if (!alive) return;
        last.current = d.messages[d.messages.length - 1]?.at;
        setThread(d);
      })
      .catch((e: Error) => alive && setError(e.message));
    const timer = setInterval(() => {
      if (document.hidden || !alive) return;
      const q = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      apiCall<Thread>(`/api/chats/${threadId}${q}`, "GET").then((d) => alive && merge(d.messages)).catch(() => {});
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [threadId, merge]);

  // Keep the newest message in view unless the person scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await apiCall(`/api/chats/${threadId}/messages`, "POST", { body });
      setText("");
      stick.current = true;
      const q = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      const d = await apiCall<Thread>(`/api/chats/${threadId}${q}`, "GET");
      merge(d.messages);
    } catch (e) {
      setError(t("chat.failed", { message: (e as Error).message }));
    } finally {
      setSending(false);
    }
  }

  if (error && !thread) return <p role="alert" className="p-6 text-sm text-neg">{error}</p>;
  if (!thread) return <div className="flex h-full items-center justify-center p-10 text-muted"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>;
  const o = thread.offer;
  const closed = o.status !== "ACTIVE";

  let day = "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="max-h-[70%] shrink-0 overflow-y-auto border-b border-border bg-surface">
        <button type="button" onClick={() => setShowLoad((v) => !v)} aria-expanded={showLoad} className="sticky top-0 z-10 flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-[15px] font-semibold">
              {city(o.originCityId)} <ArrowRight className="h-4 w-4 text-muted" aria-hidden /> {city(o.destCityId)}
              {closed && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-muted">{t("chat.loadGone")}</span>}
            </div>
            <div className="num mt-0.5 truncate text-xs text-muted">
              {thread.peerName} · {shortDate(o.loadingDate)} · {tonnes(o.weightKg)}{o.rateUsd > 0 ? ` · ${usd(o.rateUsd)}` : ""}
            </div>
          </div>
          <span className="hidden shrink-0 text-xs font-medium text-brand sm:inline">{showLoad ? t("chat.hideLoad") : t("chat.showLoad")}</span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", showLoad && "rotate-180")} aria-hidden />
        </button>
        {showLoad && (
          <div className="border-t border-border">
            <LoadDetailPanel offerId={thread.offerId} context="board" />
            <div className="border-t border-border px-4 py-2 text-right">
              <Link href={`/app/loads/${thread.offerId}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">{t("chat.openLoad")} <ExternalLink className="h-3 w-3" aria-hidden /></Link>
            </div>
          </div>
        )}
      </div>

      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-surface-2/40 px-4 py-4"
        aria-live="polite"
      >
        {thread.messages.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("chat.noMessages")}</p>}
        {thread.messages.map((m) => {
          const d = new Date(m.at).toDateString();
          const header = d !== day ? ((day = d), dateTime(m.at).split(",")[0]) : null;
          return (
            <div key={m.id}>
              {header && <div className="my-2 text-center text-[11px] font-medium uppercase tracking-wide text-subtle">{header}</div>}
              <div className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-card sm:max-w-[70%]", m.mine ? "rounded-br-md bg-brand text-brand-fg" : "rounded-bl-md border border-border bg-surface")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={cn("num mt-0.5 text-right text-[10px]", m.mine ? "text-brand-fg/70" : "text-subtle")}>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="shrink-0 border-t border-border bg-surface p-3"
      >
        {error && <p role="alert" className="mb-2 text-xs text-neg">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.placeholder")}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
          />
          <button type="submit" disabled={sending || !text.trim()} aria-label={t("chat.send")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg transition hover:brightness-110 disabled:opacity-50">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-subtle sm:block">{t("chat.hint")}</p>
      </form>
    </div>
  );
}
