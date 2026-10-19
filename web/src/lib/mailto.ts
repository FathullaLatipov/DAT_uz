/** Where to write the message: Gmail or Outlook in the browser, or whatever mail program the device has. */
export type MailProvider = "gmail" | "outlook" | "app";

export interface Draft { to: string; subject: string; body: string }

const clip = (d: Draft): Draft => ({
  to: d.to,
  // Some mail clients and browsers refuse very long links; an enquiry never needs more than this.
  subject: d.subject.slice(0, 200),
  body: d.body.slice(0, 2000),
});

/** A mailto: link with a pre-filled subject and body (CRLF line breaks, as mail clients expect). */
export function mailtoUrl(draft: Draft): string {
  const { to, subject, body } = clip(draft);
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** Gmail's compose window in the browser, already addressed and filled in (the signed-in Gmail account is the sender). */
export function gmailUrl(draft: Draft): string {
  const { to, subject, body } = clip(draft);
  const enc = encodeURIComponent;
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body.replace(/\r\n/g, "\n"))}`;
}

/** Outlook on the web (outlook.live.com handles personal and most work accounts). */
export function outlookUrl(draft: Draft): string {
  const { to, subject, body } = clip(draft);
  const enc = encodeURIComponent;
  return `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body.replace(/\r\n/g, "\n"))}`;
}

export function composeUrl(provider: MailProvider, draft: Draft): string {
  return provider === "gmail" ? gmailUrl(draft) : provider === "outlook" ? outlookUrl(draft) : mailtoUrl(draft);
}
