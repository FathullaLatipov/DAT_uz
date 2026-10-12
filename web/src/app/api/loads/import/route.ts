import { z } from "zod";
import { db } from "@/server/db";
import { api } from "@/server/http";
import { audit } from "@/server/security";
import { parseAds } from "@/server/ingestion/textparse";
import { ingestPlatformListing } from "@/server/ingestion/pipeline";
import { invalidateMarketCache } from "@/server/services/market";

const schema = z.object({ text: z.string().min(12).max(60_000), commit: z.boolean() });

/**
 * Turns pasted ad text into loads. `commit: false` returns a preview of how each ad was
 * understood; `commit: true` publishes the ones that parsed (same pipeline as posted loads).
 */
export const POST = api(
  async ({ req, session, ip }) => {
    const { text, commit } = schema.parse(await req.json());
    const batch = `${session.orgId}-p${Date.now().toString(36)}`;
    const ads = parseAds(text, batch).slice(0, 100);

    const results = [];
    for (const a of ads) {
      if (!a.listing) {
        results.push({ text: a.text, ok: false as const, problems: a.problems });
        continue;
      }
      const l = a.listing;
      const summary = { origin: l.origin, destination: l.destination, weightKg: l.weight, body: l.bodyType ?? null, loading: new Date(l.loadingDate).toISOString().slice(0, 10), rate: l.rate ?? null, currency: l.currency ?? null, phone: l.contactPhone ?? null };
      if (!commit) {
        results.push({ text: a.text, ok: true as const, summary });
        continue;
      }
      const r = await ingestPlatformListing(db, { ...l, broker: session.org.name });
      results.push(r.ok ? { text: a.text, ok: true as const, summary, offerId: r.offerId, merged: r.outcome === "duplicates" } : { text: a.text, ok: false as const, problems: r.issues.map((i) => i.message) });
    }
    if (commit) {
      invalidateMarketCache();
      await audit({ userId: session.userId, orgId: session.orgId, action: "load.paste_import", meta: { ads: ads.length, ok: results.filter((r) => r.ok).length }, ip });
    }
    return { results, imported: commit ? results.filter((r) => r.ok).length : 0 };
  },
  { limit: 20 },
);
