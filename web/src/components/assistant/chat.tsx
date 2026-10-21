"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ListChecks, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Badge } from "../ui/primitives";
import type { DispatcherReply } from "@/server/ai/dispatcher";

type Data = Omit<DispatcherReply, "text">;
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Data | null;
}

export function Chat({ initial, conversationId: initialConv, provider }: { initial: ChatMessage[]; conversationId: string | null; provider: string }) {
  const { t, m } = useI18n();
  const [messages, setMessages] = useState(initial);
  const [conversationId, setConversationId] = useState(initialConv);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string | undefined>(undefined);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, pending]);

  // The app shell's chrome (topbar, optional demo banner, page padding) varies and isn't a
  // fixed number of rems, so measure how far down the card actually sits instead of guessing.
  useLayoutEffect(() => {
    function measure() {
      if (!container.current) return;
      const top = container.current.getBoundingClientRect().top;
      setHeight(`calc(100dvh - ${top}px - 1rem)`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  async function send(text: string) {
    if (!text.trim() || pending) return;
    setInput("");
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: text }]);
    setPending(true);
    try {
      const r = await apiCall<{ conversationId: string; message: ChatMessage }>("/api/assistant", "POST", { message: text, conversationId: conversationId ?? undefined });
      setConversationId(r.conversationId);
      setMessages((m) => [...m, r.message]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: t("as.couldnt", { message: (e as Error).message }) }]);
    } finally {
      setPending(false);
    }
  }

  async function reset() {
    await apiCall("/api/assistant", "DELETE").catch(() => {});
    setMessages([]);
    setConversationId(null);
  }

  return (
    <div ref={container} style={height ? { height } : undefined} className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-brand" />
          <span className="font-medium">{t("nav.aiDispatcher")}</span>
          <Badge tone="neutral" title={t("as.badgeTitle")}>
            {provider === "anthropic" ? t("as.badgeLlm") : t("as.badgeRules")}
          </Badge>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <RotateCcw className="h-3 w-3" /> {t("as.newChat")}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg py-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-3 font-semibold">{t("as.emptyTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("as.emptySub")}</p>
            <div className="mt-5 grid gap-2">
              {m.as.suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:border-brand hover:bg-brand-soft/40">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.content} /> : <AssistantBubble key={m.id} m={m} />))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("as.pending")}
          </div>
        )}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => (e.preventDefault(), send(input))} className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <label htmlFor="chat-input" className="sr-only">{t("as.message")}</label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder={t("as.placeholder")}
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-subtle"
          />
          <button type="submit" disabled={!input.trim() || pending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-fg disabled:opacity-40" aria-label={t("as.send")}>
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-brand-fg">{text}</div>
    </div>
  );
}

function AssistantBubble({ m }: { m: ChatMessage }) {
  const { t, relativeDay, usd } = useI18n();
  const [open, setOpen] = useState(false);
  const d = m.data;
  return (
    <div className="max-w-[92%] animate-fade-up">
      {d?.provider && (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-subtle" title={t("as.badgeTitle")}>
          {d.provider === "anthropic" ? <Sparkles className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
          {d.provider === "anthropic" ? t("as.badgeLlm") : t("as.badgeRules")}
        </div>
      )}
      <div className="whitespace-pre-line rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm">{m.content}</div>
      {d?.cards && d.cards.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {d.cards.map((c, i) => (
            <Link key={c.offerId} href={`/app/loads/${c.offerId}`} className={cn("rounded-xl border bg-surface p-3 transition hover:border-border-strong", i === 0 ? "border-brand/50" : "border-border")}>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>#{i + 1}{c.truckCode && ` · ${c.truckCode}`}</span>
                <span className="num font-semibold text-brand">{c.score}%</span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{c.route}</div>
              <div className="num mt-1 flex justify-between text-xs">
                <span>{usd(c.rateUsd)}</span>
                <span className={c.profit >= 0 ? "text-pos" : "text-neg"}>{t("rec.profit", { amount: usd(c.profit) })}</span>
              </div>
              <div className="num mt-0.5 text-xs text-subtle">{relativeDay(c.loadingDate)} · {t("as.emptyKm", { n: c.deadheadKm })}</div>
            </Link>
          ))}
        </div>
      )}
      {d?.chains && d.chains.length > 1 && (
        <div className="mt-2 space-y-1 text-xs text-muted">
          {d.chains.slice(1).map((c, i) => (
            <div key={i}>{t("as.altPlan", { legs: c.legs.map((l) => l.route).join(" + "), profit: usd(c.totalProfit), perDay: usd(c.profitPerDay) })}</div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
        {d?.searchUrl && <Link href={d.searchUrl} className="text-brand hover:underline">{t("as.openBoard")}</Link>}
        {d?.steps && (
          <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-muted hover:text-fg" aria-expanded={open}>
            {t("as.how")} <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && d?.steps && (
        <ol className="mt-1.5 list-decimal space-y-0.5 rounded-lg border border-border px-3 py-2 pl-7 text-xs text-muted">
          {d.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}
