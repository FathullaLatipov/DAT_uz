export type NavKey =
  | "dashboard" | "loadBoard" | "aiDispatcher" | "fleet" | "market" | "saved" | "postLoad" | "myLoads" | "myRoutes" | "reviews" | "messages" | "calculator" | "settings";

/**
 * The cabinet menu for one company. A company with trucks runs routes, so its list of trips is **My routes**
 * (active and history); one without trucks only posts loads, so it gets **My loads**. A carrier that also posts
 * loads keeps both. Brokers have no fleet page; everyone has Reviews.
 */
export function navKeysFor(o: { isBroker: boolean; hasTrucks: boolean; postsLoads: boolean }): NavKey[] {
  const own: NavKey[] = o.hasTrucks ? (o.postsLoads ? ["myRoutes", "myLoads"] : ["myRoutes"]) : ["myLoads"];
  return [
    "dashboard", "loadBoard", "aiDispatcher",
    ...(o.isBroker ? [] : (["fleet"] as NavKey[])),
    "market", "saved", "postLoad",
    ...own,
    "messages", "reviews", "calculator", "settings",
  ];
}
