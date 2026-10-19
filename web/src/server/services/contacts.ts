import { db } from "../db";
import { phoneKey } from "../ingestion/dedupe";

export interface Contact {
  name: string | null;
  phone: string | null;
  email: string | null;
  sourceName: string;
  sourceUrl: string | null;
}

interface ListingLike {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  sourceUrl: string | null;
  lastSeenAt: Date;
  source: { name: string; isDemo: boolean };
}

/**
 * The people to contact for an offer: one row per distinct phone / e-mail, newest sighting first.
 * A load that was reposted hundreds of times would otherwise list the same poster hundreds of times.
 * Demo listings never expose contacts.
 */
export function uniqueContacts(listings: ListingLike[], max = 6): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const l of [...listings].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())) {
    if (l.source.isDemo) continue;
    const phone = l.contactPhone?.trim() || null;
    const email = l.contactEmail?.trim().toLowerCase() || null;
    if (!phone && !email && !l.contactName) continue;
    const key = phoneKey(phone) ?? email ?? `${l.contactName}|${l.source.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: l.contactName?.trim() || null, phone, email, sourceName: l.source.name, sourceUrl: l.sourceUrl });
    if (out.length >= max) break;
  }
  return out;
}

/** The signature details of the signed-in person for the enquiry e-mail (their role line and the company's contact details). */
export async function senderOf(userId: string, orgId: string) {
  const [u, o] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, jobTitle: true } }),
    db.organization.findUnique({ where: { id: orgId }, select: { name: true, phone: true, website: true, address: true, taxId: true } }),
  ]);
  return { name: u?.name ?? "", jobTitle: u?.jobTitle ?? null, org: o?.name ?? "", phone: o?.phone ?? null, website: o?.website ?? null, address: o?.address ?? null, taxId: o?.taxId ?? null };
}
