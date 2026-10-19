import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { setBrokerVerified } from "@/server/services/verification";

const schema = z.object({ verified: z.boolean(), taxId: z.string().trim().max(20).optional() });

/** Platform admin gives or removes the verified badge by hand (works for companies without a Karvon account too). */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const b = schema.parse(await req.json());
    const broker = await db.broker.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!broker) throw new HttpError(404, "Company not found.");
    if (b.taxId !== undefined) await db.broker.update({ where: { id: broker.id }, data: { taxId: b.taxId || null } });
    const r = await setBrokerVerified(broker.id, b.verified, "Set by a Karvon admin");
    await audit({ userId: session.userId, orgId: session.orgId, action: b.verified ? "broker.verify" : "broker.unverify", entity: "Broker", entityId: broker.id, ip });
    return { ok: true, ...r };
  },
  { action: "platform:admin", limit: 120 },
);
