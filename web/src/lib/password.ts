/** Rules and helpers for passwords. Pure (Web Crypto only), so the browser and the server share them and tests can run them. */

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

/** Letters and digits that cannot be mistaken for one another (no 0/O, 1/l/I) — a temporary password gets read out and retyped. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random temporary password such as `Kq7M-x2Rp-9vTb`: 12 characters from a 54-symbol alphabet (~69 bits), in groups of four. */
export function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  // 256 is not a multiple of 54, so a plain modulo would favour some symbols; draw again for the biased tail.
  const limit = 256 - (256 % ALPHABET.length);
  const out: string[] = [];
  let i = 0;
  let pool = bytes;
  while (out.length < 12) {
    if (i >= pool.length) {
      pool = new Uint8Array(12);
      globalThis.crypto.getRandomValues(pool);
      i = 0;
    }
    const b = pool[i++];
    if (b < limit) out.push(ALPHABET[b % ALPHABET.length]);
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8).join("")}`;
}

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "SAME_AS_OLD" | "MISMATCH";

/** What is wrong with a new password, if anything. */
export function checkNewPassword(next: string, opts: { current?: string; confirm?: string } = {}): PasswordProblem | null {
  if (next.length < MIN_PASSWORD) return "TOO_SHORT";
  if (next.length > MAX_PASSWORD) return "TOO_LONG";
  if (opts.confirm !== undefined && opts.confirm !== next) return "MISMATCH";
  if (opts.current !== undefined && opts.current === next) return "SAME_AS_OLD";
  return null;
}
