import { db } from "../db";
import { HttpError } from "../http";
import { postingOrgIds } from "./load-owner";
import { notifyUser, RECIPIENT_SELECT } from "./notify-user";

export const CHAT_MAX_LENGTH = 2000;

type Side = "carrier" | "shipper";

/** The side of a thread a company is on, or null when it is not a party to it. */
function sideOf(t: { carrierOrgId: string; shipperOrgId: string }, orgId: string): Side | null {
  return t.carrierOrgId === orgId ? "carrier" : t.shipperOrgId === orgId ? "shipper" : null;
}

/** Opens (or returns) the conversation between this company and the company that posted the load. */
export async function startThread(orgId: string, offerId: string): Promise<string> {
  const offer = await db.freightOffer.findUnique({ where: { id: offerId }, select: { id: true } });
  if (!offer) throw new HttpError(404, "This load is no longer available.");
  const owner = (await postingOrgIds(offerId)).find((id) => id !== orgId);
  if (!owner) throw new HttpError(409, "This load has no company on Karvon to write to.");
  const exists = await db.organization.findUnique({ where: { id: owner }, select: { id: true } });
  if (!exists) throw new HttpError(409, "This load has no company on Karvon to write to.");
  const key = { offerId, carrierOrgId: orgId, shipperOrgId: owner };
  const t = await db.chatThread.upsert({ where: { offerId_carrierOrgId_shipperOrgId: key }, create: key, update: {}, select: { id: true } });
  return t.id;
}

/** Who a load's chat would be with, for the "Write" button: null when nobody on Karvon owns the load or it is ours. */
export async function chatPeer(orgId: string, offerId: string): Promise<{ orgId: string; name: string; threadId: string | null } | null> {
  const owner = (await postingOrgIds(offerId)).find((id) => id !== orgId);
  if (!owner) return null;
  const org = await db.organization.findUnique({ where: { id: owner }, select: { id: true, name: true } });
  if (!org) return null;
  const t = await db.chatThread.findUnique({ where: { offerId_carrierOrgId_shipperOrgId: { offerId, carrierOrgId: orgId, shipperOrgId: owner } }, select: { id: true } });
  return { orgId: org.id, name: org.name, threadId: t?.id ?? null };
}

async function mine(orgId: string, threadId: string) {
  const t = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      carrierOrg: { select: { name: true } },
      shipperOrg: { select: { name: true } },
      offer: { select: { originCityId: true, destCityId: true, loadingDate: true, rateUsd: true, weightKg: true, distanceKm: true, status: true } },
    },
  });
  const side = t ? sideOf(t, orgId) : null;
  if (!t || !side) throw new HttpError(404, "Conversation not found.");
  return { t, side };
}

/** Messages of one conversation (all, or only those after a timestamp for polling); marks the other side's as read. */
export async function readThread(orgId: string, threadId: string, after?: Date) {
  const { t, side } = await mine(orgId, threadId);
  const messages = await db.chatMessage.findMany({
    where: { threadId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  await db.chatThread.update({ where: { id: threadId }, data: side === "carrier" ? { carrierReadAt: new Date() } : { shipperReadAt: new Date() } });
  return {
    side,
    peerName: side === "carrier" ? t.shipperOrg.name : t.carrierOrg.name,
    offerId: t.offerId,
    offer: { ...t.offer, loadingDate: t.offer.loadingDate.toISOString() },
    messages: messages.map((m) => ({ id: m.id, mine: m.senderOrgId === orgId, body: m.body, at: m.createdAt.toISOString() })),
  };
}

export async function sendMessage(session: { orgId: string; userId: string; org: { name: string } }, threadId: string, body: string) {
  const text = body.trim();
  if (!text) throw new HttpError(400, "Write a message first.");
  if (text.length > CHAT_MAX_LENGTH) throw new HttpError(400, `A message can be at most ${CHAT_MAX_LENGTH} characters.`);
  const { t, side } = await mine(session.orgId, threadId);
  const peerRead = side === "carrier" ? t.shipperReadAt : t.carrierReadAt;
  const unreadBefore = await db.chatMessage.count({ where: { threadId, senderOrgId: session.orgId, ...(peerRead ? { createdAt: { gt: peerRead } } : {}) } });
  const msg = await db.chatMessage.create({ data: { threadId, senderOrgId: session.orgId, senderUserId: session.userId, body: text } });
  await db.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: msg.createdAt, ...(side === "carrier" ? { carrierReadAt: msg.createdAt } : { shipperReadAt: msg.createdAt }) } });
  // Tell the other company once per burst: only when they had nothing unread from us before this message.
  if (unreadBefore === 0) {
    const peerOrg = side === "carrier" ? t.shipperOrgId : t.carrierOrgId;
    const members = await db.membership.findMany({ where: { orgId: peerOrg }, select: { user: { select: RECIPIENT_SELECT } } });
    for (const { user } of members) {
      await notifyUser(user, (i) => ({
        title: i.t("notify.chatTitle", { name: session.org.name }),
        body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
        link: `/app/chats?t=${threadId}`,
        button: i.t("notify.chatOpen"),
      })).catch((e) => console.error("[chat] could not notify", e));
    }
  }
  return { id: msg.id, at: msg.createdAt.toISOString() };
}

/** All conversations of a company, newest first, with the last message and how many are unread. */
export async function threadsFor(orgId: string) {
  const threads = await db.chatThread.findMany({
    where: { OR: [{ carrierOrgId: orgId }, { shipperOrgId: orgId }], messages: { some: {} } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      carrierOrg: { select: { name: true } },
      shipperOrg: { select: { name: true } },
      offer: { select: { originCityId: true, destCityId: true, loadingDate: true, rateUsd: true, weightKg: true, status: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return Promise.all(
    threads.map(async (t) => {
      const side = sideOf(t, orgId)!;
      const readAt = side === "carrier" ? t.carrierReadAt : t.shipperReadAt;
      const unread = await db.chatMessage.count({ where: { threadId: t.id, senderOrgId: { not: orgId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) } });
      const last = t.messages[0];
      return {
        id: t.id,
        peerName: side === "carrier" ? t.shipperOrg.name : t.carrierOrg.name,
        offerId: t.offerId,
        offer: t.offer,
        last: last ? { body: last.body, mine: last.senderOrgId === orgId, at: last.createdAt } : null,
        unread,
      };
    }),
  );
}

/** Total unread messages for the menu badge. */
export async function unreadChatCount(orgId: string): Promise<number> {
  const threads = await db.chatThread.findMany({
    where: { OR: [{ carrierOrgId: orgId }, { shipperOrgId: orgId }] },
    select: { id: true, carrierOrgId: true, carrierReadAt: true, shipperReadAt: true },
  });
  let n = 0;
  for (const t of threads) {
    const readAt = t.carrierOrgId === orgId ? t.carrierReadAt : t.shipperReadAt;
    n += await db.chatMessage.count({ where: { threadId: t.id, senderOrgId: { not: orgId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) } });
  }
  return n;
}
