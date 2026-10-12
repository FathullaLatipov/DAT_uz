import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";
import { audit } from "@/server/security";
import { manualImportAdapter } from "@/server/ingestion/adapters/csv";
import { runIngestion } from "@/server/ingestion/pipeline";
import { invalidateMarketCache } from "@/server/services/market";

const schema = z.object({ csv: z.string().min(10).max(2_000_000) });

export const POST = api(
  async ({ req, session, ip }) => {
    const { csv } = schema.parse(await req.json());
    const stats = await runIngestion(db, manualImportAdapter(csv, { isDemo: false }));
    invalidateMarketCache();
    await audit({ userId: session.userId, action: "admin.csv_import", meta: stats, ip });
    return { ok: true, stats };
  },
  { action: "platform:admin", limit: 10 },
);
