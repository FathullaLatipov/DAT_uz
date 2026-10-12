import { db } from "@/server/db";
import { api } from "@/server/http";
import { audit } from "@/server/security";
import { syncAllSources } from "@/server/ingestion/registry";
import { invalidateMarketCache } from "@/server/services/market";

export const POST = api(
  async ({ session, ip }) => {
    const results = await syncAllSources(db);
    invalidateMarketCache();
    await audit({ userId: session.userId, action: "admin.sync", meta: results, ip });
    return { ok: true, results };
  },
  { action: "platform:admin", limit: 6 },
);
