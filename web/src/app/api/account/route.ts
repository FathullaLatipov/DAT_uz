import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";

const schema = z.object({ emailAlerts: z.boolean() });

/** The signed-in person's own switches. */
export const PATCH = api(
  async ({ req, session }) => {
    const b = schema.parse(await req.json());
    await db.user.update({ where: { id: session.userId }, data: { emailAlerts: b.emailAlerts } });
    return { ok: true };
  },
  { limit: 30 },
);
