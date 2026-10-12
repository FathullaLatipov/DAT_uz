import { z } from "zod";
import { db } from "@/server/db";
import { api, HttpError } from "@/server/http";
import { filtersFromParams } from "@/server/services/filters";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  query: z.string().max(2000), // URL query string of the board
  channels: z.array(z.enum(["WEB", "EMAIL", "TELEGRAM"])).optional(),
});

export const POST = api(async ({ req, session }) => {
  const body = schema.parse(await req.json());
  const filters = filtersFromParams(Object.fromEntries(new URLSearchParams(body.query)));
  if ((await db.savedSearch.count({ where: { userId: session.userId } })) >= 25) throw new HttpError(400, "You can keep up to 25 saved searches.");
  const s = await db.savedSearch.create({
    data: { orgId: session.orgId, userId: session.userId, name: body.name, filters: JSON.stringify(filters), channels: JSON.stringify(body.channels ?? ["WEB"]) },
  });
  return { ok: true, id: s.id };
});
