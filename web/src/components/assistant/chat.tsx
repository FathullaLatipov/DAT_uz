"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn, relativeDay, usd } from "@/lib/format";
import { Badge } from "../ui/primitives";
import type { DispatcherReply } from "@/server/ai/dispatcher";

type Data = Omit<DispatcherReply, "text">;
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Data | null;
}

const SUGGESTIONS = [
  "Find me a profitable load from Tashkent tomorrow for truck T-1024",
  "20 ton refrigerated load from Samarkand to Russia this week",
  "Find a return load for T-1031",
  "Plan a round trip for T-1024",
];

export function Chat({ initial, conversationId: initialConv, provider }: { initial: ChatMessage[]; conversationId: string | null; provider: string }) {
  const [messages, setMessages] = useState(initial);
  const [conversationId, setConversationId] = useState(initialConv);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, pending]);

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
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: `I couldn't complete that: ${(e as Error).message}` }]);
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
    <div className="flex h-[calc(100dvh-11rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-brand" />
          <span className="font-medium">AI dispatcher</span>
          <Badge tone="neutral" title="Language understanding engine. Money, distance and scores are always computed deterministically.">
            {provider === "anthropic" ? "LLM + deterministic engine" : "Rule parser + deterministic engine"}
          </Badge>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <RotateCcw className="h-3 w-3" /> New chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg py-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-3 font-semibold">Ask for loads the way you&apos;d ask a dispatcher</h2>
            <p className="mt-1 text-sm text-muted">I check your truck, its location, deadhead and costs, then rank and explain the options.</p>
            <div className="mt-5 grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:border-brand hover:bg-brand-soft/40">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.content} /> : <AssistantBubble key={m.id} m={m} />))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking trucks, searching loads, calculating profit…
          </div>
        )}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => (e.preventDefault(), send(input))} className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <label htmlFor="chat-input" className="sr-only">Message</label>
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
            placeholder="e.g. Best load from Fergana this week for T-1032"
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-subtle"
          />
          <button type="submit" disabled={!input.trim() || pending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-fg disabled:opacity-40" aria-label="Send">
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
  const [open, setOpen] = useState(false);
  const d = m.data;
  return (
    <div className="max-w-[92%] animate-fade-up">
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
                <span className={c.profit >= 0 ? "text-pos" : "text-neg"}>{usd(c.profit)} profit</span>
              </div>
              <div className="num mt-0.5 text-xs text-subtle">{relativeDay(c.loadingDate)} · {c.deadheadKm} km empty</div>
            </Link>
          ))}
        </div>
      )}
      {d?.chains && d.chains.length > 1 && (
        <div className="mt-2 space-y-1 text-xs text-muted">
          {d.chains.slice(1).map((c, i) => (
            <div key={i}>Alt plan: {c.legs.map((l) => l.route).join(" + ")} — {usd(c.totalProfit)} ({usd(c.profitPerDay)}/day)</div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
        {d?.searchUrl && <Link href={d.searchUrl} className="text-brand hover:underline">Open in load board →</Link>}
        {d?.steps && (
          <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-muted hover:text-fg" aria-expanded={open}>
            How I got this <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
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
