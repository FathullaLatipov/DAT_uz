import type { PrismaClient } from "@prisma/client";

/**
 * "This load is gone" signals read from a Telegram group: the poster deleted the ad, edited it to say it is closed,
 * or somebody replied "взяли" / "занято" under it. A load nobody can take any more should leave the board at once,
 * not hours later when it simply stops being confirmed.
 */

/** Words that say the load is taken or no longer there (Russian, Uzbek Latin and Cyrillic, English). Regex literals, so `\s` means what it says. */
const CLOSED_WORDS: RegExp[] = [
  /взяли/, /взят[оаы]?/, /забрали/, /занят[оаы]?/, /закрыт[оаы]?/, /закрыли/, /найден[аы]?/, /нашли/, /машина\s+есть/,
  /не\s*актуальн\p{L}*/u, /неактуальн\p{L}*/u, /уже\s+нет/, /груза\s+нет/, /нет\s+груза/, /ушёл/, /ушел/, /ушла/, /снят[оаы]?/, /отменён/, /отменен/, /отмена/,
  /olindi/, /olib\s+qo['’]?yildi/, /band/, /yopildi/, /topildi/, /kerak\s+emas/, /aktual\s+emas/, /mavjud\s+emas/, /bo['’]?lmaydi/,
  /олинди/, /банд/, /ёпилди/, /топилди/, /керак\s+эмас/,
  /taken/, /closed/, /no\s+longer/, /not\s+available/, /already\s+gone/,
];
// A word, not part of a longer one: no letter or digit right before or after.
const CLOSED = new RegExp(CLOSED_WORDS.map((r) => String.raw`(?<![\p{L}\d])(?:${r.source})(?![\p{L}\d])`).join("|"), "iu");
/** "не взяли", "ещё не занят", "not taken" mean the opposite. */
const NEGATED = /(?<![\p{L}\d])(?:не|ещ[её]\s+не|пока\s+не|hali|not|isn['’]?t|still\s+not)\s+(?:\p{L}+\s+)?(?:взяли|взят|занят|закрыт|olindi|band|taken|closed)/iu;

/** True when a message says the load it is about is taken or closed. Questions and negations do not count. */
export function isClosureText(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 400) return false; // a reply, not another ad
  if (t.includes("?")) return false; // "взяли?" asks, it does not say
  if (NEGATED.test(t)) return false;
  return CLOSED.test(t);
}

export type ClosureKind = "deleted" | "reply" | "edited";

/** Telegram message id → the external id a listing from that message was stored under (`parseAd` numbers ads in a message from 1). */
export const listingExternalId = (messageId: number) => `${messageId}-1`;

/**
 * Takes a Telegram listing off the board. The listing is removed; if it was the offer's only source the offer is
 * marked EXPIRED, if other sources still list the load it stays up. Returns what happened.
 */
export async function closeTelegramListing(db: PrismaClient, groupUsername: string, messageId: number): Promise<{ closed: boolean; offerId?: string; offerExpired?: boolean }> {
  const listing = await db.freightListing.findUnique({
    where: { sourceId_externalId: { sourceId: `tg-${groupUsername.toLowerCase()}`, externalId: listingExternalId(messageId) } },
    select: { id: true, offerId: true },
  });
  if (!listing) return { closed: false };
  const left = await db.$transaction(async (tx) => {
    await tx.freightListing.delete({ where: { id: listing.id } });
    const remaining = await tx.freightListing.count({ where: { offerId: listing.offerId } });
    // Only an offer that is still on offer is taken down; one already booked or expired stays as it is.
    if (remaining === 0) await tx.freightOffer.updateMany({ where: { id: listing.offerId, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    return remaining;
  });
  return { closed: true, offerId: listing.offerId, offerExpired: left === 0 };
}
