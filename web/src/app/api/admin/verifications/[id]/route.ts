import { z } from "zod";
import { api, HttpError } from "@/server/http";
import { audit } from "@/server/security";
import { approveVerification, rejectVerification } from "@/server/services/verification";

const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() });

/** Platform admin decides a verification request. */
export const POST = api<{ id: string }>(
  async ({ req, session, params, ip }) => {
    const b = schema.parse(await req.json());
    const r = b.decision === "approve" ? await approveVerification(params.id, session.userId) : await rejectVerification(params.id, session.userId, b.reason || "Not approved.");
    if ("error" in r) throw new HttpError(r.error === "not-found" ? 404 : 409, r.error === "not-found" ? "Request not found." : "This request has already been decided.");
    await audit({ userId: session.userId, orgId: session.orgId, action: `verification.${b.decision}`, entity: "VerificationRequest", entityId: params.id, ip });
    return { ok: true };
  },
  { action: "platform:admin", limit: 60 },
);
