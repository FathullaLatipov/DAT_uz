import { unstable_cache } from "next/cache";
import { db } from "../db";

/**
 * Numbers the landing page shows about where freight comes from. Counted from the database, never
 * hard-coded, so the page can't claim more sources than the platform actually has. Demo sources are
 * excluded; a Telegram group counts only once it has delivered at least one ad.
 */
export const sourceStats = unstable_cache(
  async () => {
    const [telegramGroups, otherSources] = await Promise.all([
      db.freightSource.count({ where: { id: { startsWith: "tg-" }, isDemo: false, lastSuccessAt: { not: null } } }),
      db.freightSource.count({ where: { NOT: { id: { startsWith: "tg-" } }, isDemo: false, status: "ACTIVE" } }),
    ]);
    return { telegramGroups, otherSources };
  },
  ["landing-source-stats"],
  { revalidate: 300 },
);
