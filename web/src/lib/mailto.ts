/** A mailto: link with a pre-filled subject and body (CRLF line breaks, as mail clients expect). */
export function mailtoUrl({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  // Some mail clients and browsers refuse very long mailto: URLs; an enquiry never needs more than this.
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${enc(subject.slice(0, 200))}&body=${enc(body.slice(0, 1500))}`;
}
