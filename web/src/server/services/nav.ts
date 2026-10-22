import { db } from "../db";
import { memoize } from "../cache";
import { PLATFORM_SOURCE_ID } from "../domain/freshness";

/** What decides a company's menu: does it have trucks, and has it posted loads. Kept for a minute; clearing the shared memos (any truck or load change) refreshes it. */
export function navFlags(orgId: string): Promise<{ hasTrucks: boolean; postsLoads: boolean }> {
  return memoize(`nav:${orgId}`, 60_000, async () => {
    const [truck, posted] = await Promise.all([
      db.truck.findFirst({ where: { orgId }, select: { id: true } }),
      db.freightListing.findFirst({ where: { sourceId: PLATFORM_SOURCE_ID, externalId: { startsWith: `${orgId}-` } }, select: { id: true } }),
    ]);
    return { hasTrucks: !!truck, postsLoads: !!posted };
  });
}
