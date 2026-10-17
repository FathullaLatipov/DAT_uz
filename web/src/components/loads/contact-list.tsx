"use client";

import { Mail, Phone, Send } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { mailtoUrl } from "@/lib/mailto";
import type { Contact } from "@/server/services/contacts";

export interface EnquiryContext {
  originId: string;
  destId: string;
  weightKg: number;
  bodyType: string;
  /** ISO date of loading */
  loadingDate: string;
  rateUsd: number;
  truck?: { code: string; bodyType: string; capacityKg: number } | null;
  viewer?: { name: string; org: string } | null;
}

/**
 * Contacts for a load. A phone is a tel: link; an e-mail gets a "Send" button that opens the visitor's
 * mail program with a ready enquiry (route, weight, date, their truck, what to confirm), like the
 * one-click enquiry on other freight boards.
 */
export function ContactList({ contacts, ctx }: { contacts: Contact[]; ctx: EnquiryContext }) {
  const { t, city, tonnes, usd, label, shortDate } = useI18n();

  function enquiry(c: Contact) {
    const route = `${city(ctx.originId)} → ${city(ctx.destId)}`;
    const date = shortDate(ctx.loadingDate);
    const lines = [
      c.name ? t("mail.helloNamed", { name: c.name }) : t("mail.hello"),
      "",
      t("mail.intro", { route, weight: tonnes(ctx.weightKg), body: label(ctx.bodyType).toLowerCase(), date }),
      ...(ctx.rateUsd > 0 ? [t("mail.rate", { rate: usd(ctx.rateUsd) })] : []),
      ...(ctx.truck ? [t("mail.truck", { truck: `${tonnes(ctx.truck.capacityKg)} ${label(ctx.truck.bodyType).toLowerCase()}` })] : []),
      "",
      t("mail.ask"),
      `1. ${t("mail.q1")}`,
      `2. ${t("mail.q2")}`,
      `3. ${t("mail.q3")}`,
      "",
      t("mail.thanks"),
      ...(ctx.viewer ? [ctx.viewer.name, ctx.viewer.org] : []),
    ];
    return mailtoUrl({ to: c.email!, subject: t("mail.subject", { route, weight: tonnes(ctx.weightKg), date }), body: lines.join("\n") });
  }

  return (
    <ul className="space-y-1.5 text-sm">
      {contacts.map((c, i) => (
        <li key={`${c.phone ?? c.email ?? c.name}-${i}`} className="rounded-lg border border-border bg-surface px-3 py-2">
          <div className="truncate font-medium">{c.name ?? c.sourceName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </a>
            )}
            {c.email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="truncate text-muted">{c.email}</span>
                <a
                  href={enquiry(c)}
                  title={t("mail.sendTitle", { email: c.email })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand hover:brightness-95"
                >
                  <Send className="h-3 w-3" /> {t("mail.send")}
                </a>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
