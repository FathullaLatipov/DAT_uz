/**
 * HIDE_DEMO=1 hides generated demo FREIGHT everywhere (catalog, load board,
 * recommendations, analytics, backhaul). Demo fleet/trips of the demo workspace stay,
 * so the matching engine can still be shown with real loads.
 */
export const hideDemoFreight = () => process.env.HIDE_DEMO === "1";
export const demoOfferFilter = (): { isDemo?: false } => (hideDemoFreight() ? { isDemo: false } : {});
