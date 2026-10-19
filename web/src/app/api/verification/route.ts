import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";

const schema = z.object({
  companyName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().regex(/^[0-9A-Za-z-]{5,20}$/, "Enter a valid tax ID"),
  phone: z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number"),
  note: z.string().trim().max(500).optional(),
});

/** A company asks to be verified. One request at a time per company; a rejected one can be sent again. */
export const POST = api(
  async ({ req, session, ip }) => {
    const b = schema.parse(await req.json());
    const open = await db.verificationRequest.findFirst({ where: { orgId: session.orgId, status: "PENDING" }, select: { id: true } });
    if (open) throw new HttpError(409, "Your request is already being reviewed.");
    const created = await db.verificationRequest.create({
      data: { orgId: session.orgId, userId: session.userId, companyName: b.companyName, taxId: b.taxId, phone: b.phone, note: b.note || null },
    });
    await audit({ userId: session.userId, orgId: session.orgId, action: "verification.request", entity: "VerificationRequest", entityId: created.id, ip });
    return { ok: true, id: created.id };
  },
  { limit: 10 },
);
