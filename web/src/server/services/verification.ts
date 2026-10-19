import { db } from "../db";
import { brokerKey, qualityLevel } from "../ingestion/normalize";
import { notifyUser, RECIPIENT_SELECT } from "./notify-user";
import { invalidateMarketCache } from "./market";

/**
 * Marks a company (broker) as verified or not, and brings the quality level of its active loads in line:
 * a verified poster with no data problems makes a load VERIFIED; removing the badge takes that back.
 */
export async function setBrokerVerified(brokerId: string, verified: boolean, method: string | null) {
  await db.broker.update({ where: { id: brokerId }, data: { verified, verificationMethod: verified ? method : null } });
  const offers = await db.freightOffer.findMany({
    where: { brokerId, status: "ACTIVE" },
    select: { id: true, qualityFlags: true, quality: true, listings: { select: { sourceId: true } } },
    take: 5000,
  });
  let changed = 0;
  for (const o of offers) {
    const flags = JSON.parse(o.qualityFlags) as string[];
    const quality = qualityLevel(
      flags.map((code) => ({ code, severity: "WARN" as const, message: code })),
      { brokerVerified: verified, sourceCount: new Set(o.listings.map((l) => l.sourceId)).size },
    );
    if (quality !== o.quality) {
      await db.freightOffer.update({ where: { id: o.id }, data: { quality } });
      changed++;
    }
  }
  invalidateMarketCache();
  return { offersRequalified: changed };
}

/** Tells every member of a company the outcome, in each person's language and on every channel they use. */
async function tellOrg(orgId: string, approved: boolean, vars: { company: string; reason?: string }) {
  const members = await db.membership.findMany({ where: { orgId }, select: { user: { select: RECIPIENT_SELECT } } });
  for (const { user } of members) {
    await notifyUser(user, (i) => ({
      title: i.t(approved ? "ver.approvedTitle" : "ver.rejectedTitle"),
      body: approved ? i.t("ver.approvedNote", { company: vars.company }) : i.t("ver.rejectedNote", { reason: vars.reason ?? "" }),
      link: "/app/settings",
      button: i.t("ver.title"),
    }));
  }
}

export async function approveVerification(requestId: string, adminUserId: string) {
  const req = await db.verificationRequest.findUnique({ where: { id: requestId }, include: { org: { select: { id: true, name: true } } } });
  if (!req) return { error: "not-found" as const };
  const claimed = await db.verificationRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { status: "APPROVED", decidedAt: new Date(), decidedById: adminUserId, reason: null } });
  if (claimed.count === 0) return { error: "already-decided" as const };
  // The poster's identity on loads is the organization's name (see the post-a-load API), so that is the broker to verify.
  const key = brokerKey(req.org.name);
  if (!key) return { error: "no-name" as const };
  const broker = await db.broker.upsert({
    where: { normalizedName: key },
    create: { name: req.org.name, normalizedName: key, taxId: req.taxId, countryCode: "UZ" },
    update: { taxId: req.taxId },
  });
  const r = await setBrokerVerified(broker.id, true, "Documents checked by a Karvon admin");
  await tellOrg(req.orgId, true, { company: req.org.name });
  return { ok: true as const, brokerId: broker.id, ...r };
}

export async function rejectVerification(requestId: string, adminUserId: string, reason: string) {
  const req = await db.verificationRequest.findUnique({ where: { id: requestId }, include: { org: { select: { name: true } } } });
  if (!req) return { error: "not-found" as const };
  const claimed = await db.verificationRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: adminUserId, reason } });
  if (claimed.count === 0) return { error: "already-decided" as const };
  await tellOrg(req.orgId, false, { company: req.org.name, reason });
  return { ok: true as const };
}
