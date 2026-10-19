import { z } from "zod";
import { db } from "@/server/db";
import { can } from "@/server/auth/permissions";
import { api, HttpError } from "@/server/http";

const text = (max: number) => z.string().trim().max(max).optional();
const schema = z.object({
  jobTitle: text(80),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")]).optional(),
  website: z.union([z.literal(""), z.string().trim().url("Enter a valid website address").max(200)]).optional(),
  address: text(200),
  taxId: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Za-z-]{5,20}$/, "Enter a valid tax ID")]).optional(),
});

/**
 * The details that sign the e-mails a person sends from a load. The role line is theirs; phone, website,
 * address and tax ID belong to the company, so changing them needs the right to edit company settings.
 */
export const PATCH = api(
  async ({ req, session }) => {
    const b = schema.parse(await req.json());
    const orgPart = { phone: b.phone, website: b.website, address: b.address, taxId: b.taxId };
    const touchesOrg = Object.values(orgPart).some((v) => v !== undefined);
    if (touchesOrg && !can(session, "settings:write")) throw new HttpError(403, "Your role doesn't allow this action.");
    const clean = (v: string | undefined) => (v === undefined ? undefined : v || null);
    await db.$transaction([
      db.user.update({ where: { id: session.userId }, data: { jobTitle: clean(b.jobTitle) } }),
      ...(touchesOrg ? [db.organization.update({ where: { id: session.orgId }, data: { phone: clean(b.phone), website: clean(b.website), address: clean(b.address), taxId: clean(b.taxId) } })] : []),
    ]);
    return { ok: true };
  },
  { limit: 30 },
);
