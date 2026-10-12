import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { getProvider } from "@/server/ai/provider";
import { filtersToParams } from "@/server/services/filters";

const schema = z.object({ q: z.string().trim().min(1).max(300) });

export const POST = api(
  async ({ req, session }) => {
    const { q } = schema.parse(await req.json());
    const parsed = await getProvider().parseQuery(q, new Date());
    const f = { ...parsed.filters };
    if (parsed.truckCode) {
      const t = await db.truck.findFirst({ where: { orgId: session.orgId, code: parsed.truckCode }, select: { id: true } });
      if (t) f.truckId = t.id;
    }
    const params = filtersToParams(f);
    params.set("nl", q);
    return { url: `/app/loads?${params.toString()}`, filters: f, understood: parsed.understood, parser: parsed.parser };
  },
  { limit: 30 },
);
