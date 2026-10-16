import { MESSAGES } from "./messages";

/**
 * API errors are thrown in English — the text doubles as the lookup key — and translated just
 * before they leave the server. Each English template in `errors` (with {placeholders}) is
 * compiled into an anchored pattern; a message that matches one is rendered in the visitor's
 * language, anything else passes through untouched. tests/i18n.test.ts checks that every
 * message the code can throw has a template.
 */
const TEMPLATES = Object.entries(MESSAGES.en.errors).map(([key, tpl]) => ({
  key,
  vars: [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
  re: new RegExp("^" + tpl.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(.+?)") + "$", "s"),
}));

/** Which template a thrown English message is an instance of, with the values for its placeholders. */
export function findErrorTemplate(message: string): { key: string; vars: Record<string, string> } | null {
  for (const t of TEMPLATES) {
    const m = message.match(t.re);
    if (m) return { key: t.key, vars: Object.fromEntries(t.vars.map((name, n) => [name, m[n + 1]])) };
  }
  return null;
}
