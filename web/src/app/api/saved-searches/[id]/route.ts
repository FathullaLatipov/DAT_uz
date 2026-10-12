import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";

const patch = z.object({ channels: z.array(z.enum(["WEB", "EMAIL", "TELEGRAM"])).optional(), name: z.string().trim().min(1).max(100).optional() });

async function own(id: string, userId: string) {
  const s = await db.savedSearch.findFirst({ where: { id, userId } });
  if (!s) throw new HttpError(404, "Saved search not found.");
  return s;
}

export const PATCH = api<{ id: string }>(async ({ req, session, params }) => {
  await own(params.id, session.userId);
  const body = patch.parse(await req.json());
  await db.savedSearch.update({
    where: { id: params.id },
    data: { ...(body.name ? { name: body.name } : {}), ...(body.channels ? { channels: JSON.stringify(body.channels) } : {}) },
  });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async ({ session, params }) => {
  await own(params.id, session.userId);
  await db.savedSearch.delete({ where: { id: params.id } });
  return { ok: true };
});
