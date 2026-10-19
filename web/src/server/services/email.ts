import { appendFile } from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { esc } from "./telegram";

/**
 * Outgoing e-mail. Configure with SMTP_URL (e.g. smtps://user:app-password@smtp.gmail.com:465) and EMAIL_FROM.
 * For development and tests, SMTP_URL=file:/path/outbox.jsonl writes each message as a JSON line instead of sending.
 * Without SMTP_URL nothing is sent and callers carry on (in-app and Telegram notifications still work).
 */
export const emailConfigured = () => !!process.env.SMTP_URL;

let cached: { url: string; tx: Transporter } | undefined;
function transporter(): Transporter | null {
  const url = process.env.SMTP_URL;
  if (!url) return null;
  if (cached?.url !== url) cached = { url, tx: url.startsWith("file:") ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(url) };
  return cached.tx;
}

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body (also the fallback for clients that do not show HTML). */
  text: string;
  button?: { text: string; url: string };
  footer?: string;
}

/** A small, safe HTML version of the message: escaped text, one button. */
export function renderEmailHtml(m: Pick<EmailMessage, "subject" | "text" | "button" | "footer">): string {
  const paragraphs = m.text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f2933">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = m.button
    ? `<p style="margin:22px 0"><a href="${esc(m.button.url)}" style="background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px;display:inline-block">${esc(m.button.text)}</a></p>`
    : "";
  const footer = m.footer ? `<p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#6b7280">${esc(m.footer)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px"><p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#0f766e">Karvon</p><h1 style="margin:0 0 14px;font-size:18px;color:#111827">${esc(m.subject)}</h1>${paragraphs}${button}${footer}</div></body></html>`;
}

/** Sends one message. Never throws: a mail that cannot go out must not break the action that raised it. */
export async function sendEmail(m: EmailMessage): Promise<boolean> {
  const tx = transporter();
  if (!tx) return false;
  try {
    const text = m.button ? `${m.text}\n\n${m.button.text}: ${m.button.url}${m.footer ? `\n\n${m.footer}` : ""}` : `${m.text}${m.footer ? `\n\n${m.footer}` : ""}`;
    const info = await tx.sendMail({ from: process.env.EMAIL_FROM ?? "Karvon <no-reply@karvon.uz>", to: m.to, subject: m.subject, text, html: renderEmailHtml(m) });
    const url = process.env.SMTP_URL!;
    if (url.startsWith("file:")) await appendFile(url.slice(5), `${typeof info.message === "string" ? info.message : JSON.stringify(info.message)}\n`);
    return true;
  } catch (e) {
    console.error("[email] could not send", e);
    return false;
  }
}
