"use client";

import { Mail, Phone } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { buildEnquiry, type Enquiry, type Sender } from "@/lib/enquiry";
import type { Contact } from "@/server/services/contacts";
import { MailButton } from "./mail-button";

export interface EnquiryContext extends Enquiry {
  viewer?: Sender | null;
}

/**
 * Contacts for a load. A phone is a tel: link; an e-mail gets a "Send" button that opens a ready, addressed
 * message (route, date, weight, the sender's truck, what to confirm, and their signature) in Gmail, Outlook or
 * the mail app, like the one-click enquiry on other freight boards.
 */
export function ContactList({ contacts, ctx }: { contacts: Contact[]; ctx: EnquiryContext }) {
  const i18n = useI18n();

  const draftFor = (c: Contact) => ({ to: c.email!, ...buildEnquiry(i18n, ctx, { name: c.name }, ctx.viewer ?? null) });

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
                <MailButton draft={draftFor(c)} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
