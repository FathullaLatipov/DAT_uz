"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Mail, Send } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { composeUrl, type Draft, type MailProvider } from "@/lib/mailto";
import { cn } from "@/lib/format";

const KEY = "karvon.mail";
const PROVIDERS: MailProvider[] = ["gmail", "outlook", "app"];

/**
 * "Send" for an e-mail address: opens a ready, addressed message — in Gmail in the browser by default, or Outlook,
 * or the device's own mail program (the menu next to it; the choice is remembered on this device) — or copies the text.
 */
export function MailButton({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<MailProvider>("gmail");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "gmail" || saved === "outlook" || saved === "app") setProvider(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (p: MailProvider) => {
    setProvider(p);
    setOpen(false);
    try { localStorage.setItem(KEY, p); } catch {}
  };
  const label: Record<MailProvider, string> = { gmail: t("mail.viaGmail"), outlook: t("mail.viaOutlook"), app: t("mail.viaApp") };
  const url = composeUrl(provider, draft);

  return (
    <span ref={box} className="relative inline-flex shrink-0">
      <a
        href={url}
        // The webmail compose windows open in a new tab so the board stays where it is; a mailto: hands over to the mail app.
        {...(provider === "app" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        title={t("mail.sendTitle", { email: draft.to })}
        className="inline-flex items-center gap-1 rounded-l-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand hover:brightness-95"
      >
        <Send className="h-3 w-3" /> {t("mail.send")}
      </a>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("mail.more")}
        aria-expanded={open}
        className="inline-flex items-center rounded-r-md border-l border-brand/20 bg-brand-soft px-1 text-brand hover:brightness-95"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-border bg-surface p-1 text-sm shadow-lg">
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">{t("mail.openIn")}</div>
          {PROVIDERS.map((p) => (
            <a
              key={p}
              role="menuitem"
              href={composeUrl(p, draft)}
              {...(p === "app" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              onClick={() => choose(p)}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2", p === provider && "font-medium text-brand")}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" /> {label[p]} {p === provider && <Check className="ml-auto h-3.5 w-3.5" />}
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); setOpen(false); }).catch(() => {});
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-pos" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("mail.copied") : t("mail.copy")}
          </button>
        </div>
      )}
    </span>
  );
}
