import { db } from "../db";
import { getCity } from "../domain/geo";
import { label } from "../domain/enums";
import { bestChains, findBackhaul } from "../services/backhaul";
import { getMatchTrucks, searchLoads, type LoadRow } from "../services/freight";
import type { MatchTruck } from "../services/matching";
import { getProvider } from "./provider";
import type { ParsedQuery } from "./nlsearch";

/**
 * AI dispatcher pipeline:
 * 1 understand intent → 2 identify truck → 3 check capabilities → 4 check location →
 * 5 search loads → 6 deadhead → 7 profitability → 8 rank → 9 explain.
 * Steps 2–8 are deterministic; the LLM (if configured) only parses and phrases.
 */

export interface DispatcherCard {
  offerId: string;
  route: string;
  rateUsd: number;
  score: number;
  profit: number;
  deadheadKm: number;
  distanceKm: number;
  truckCode: string | null;
  loadingDate: string;
}

export interface DispatcherReply {
  text: string;
  steps: string[];
  parsed: ParsedQuery;
  cards: DispatcherCard[];
  chains?: { legs: { offerId: string; route: string }[]; totalProfit: number; profitPerDay: number; days: number; utilization: number }[];
  searchUrl?: string;
  provider: string;
}

const city = (id: string) => getCity(id)?.name ?? id;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const card = (r: { offer: LoadRow["offer"]; match: NonNullable<LoadRow["match"]> }, truckCode: string | null): DispatcherCard => ({
  offerId: r.offer.id,
  route: `${city(r.offer.originCityId)} → ${city(r.offer.destCityId)}`,
  rateUsd: r.offer.rateUsd,
  score: r.match.score,
  profit: r.match.profit.profit,
  deadheadKm: r.match.deadheadKm,
  distanceKm: r.offer.distanceKm,
  truckCode,
  loadingDate: r.offer.loadingDate.toISOString(),
});

export async function dispatch(orgId: string, userId: string, message: string): Promise<DispatcherReply> {
  const provider = getProvider();
  const now = new Date();
  const parsed = await provider.parseQuery(message, now);
  const steps: string[] = [`Understood: ${parsed.understood.length ? parsed.understood.join(" · ") : "general request"} (${parsed.parser === "llm" ? "LLM" : "rule"} parser)`];

  if (parsed.intent === "help") {
    return {
      text:
        "I can find and rank loads for your trucks. Try:\n• “Find me a profitable load from Tashkent tomorrow for truck T-1024”\n• “20 ton refrigerated load from Tashkent to Kazakhstan next week”\n• “Find a return load for T-1031”\n• “Plan a round trip for T-1024”",
      steps, parsed, cards: [], provider: provider.name,
    };
  }

  const trucks = await getMatchTrucks(orgId);
  let truck: MatchTruck | undefined;
  if (parsed.truckCode) {
    truck = trucks.find((t) => t.code.toUpperCase() === parsed.truckCode!.toUpperCase());
    if (!truck) {
      const all = await db.truck.findMany({ where: { orgId }, select: { code: true, status: true } });
      const known = all.find((t) => t.code.toUpperCase() === parsed.truckCode!.toUpperCase());
      return {
        text: known
          ? `Truck ${known.code} is currently ${label(known.status).toLowerCase()}, so I can't match loads for it right now.`
          : `I couldn't find truck ${parsed.truckCode} in your fleet. Your trucks: ${all.map((t) => t.code).join(", ") || "none yet"}.`,
        steps, parsed, cards: [], provider: provider.name,
      };
    }
    steps.push(`Truck ${truck.code}: ${(truck.capacityKg / 1000).toFixed(0)} t ${label(truck.bodyType).toLowerCase()}, free in ${city(truck.currentCityId)} from ${truck.availableFrom.toISOString().slice(0, 10)}`);
  } else if (!trucks.length) {
    return { text: "You don't have any available trucks yet. Add a truck in Fleet so I can match loads to it.", steps, parsed, cards: [], provider: provider.name };
  } else {
    steps.push(`No truck specified — evaluating all ${trucks.length} available trucks`);
  }

  // Backhaul: search around where the truck will be free.
  if (parsed.intent === "backhaul") {
    const t = truck ?? trucks[0];
    const plan = await findBackhaul(orgId, t, t.currentCityId, t.availableFrom, 120, 3);
    steps.push(`Searching return loads within 120 km of ${city(t.currentCityId)} from ${t.availableFrom.toISOString().slice(0, 10)}`);
    const cards = plan.options.map((o) => card(o, t.code));
    const text = cards.length
      ? `${t.code} will be free in ${city(t.currentCityId)}. I found ${plan.totalFound} suitable return loads.\n\nBest: ${cards[0].route}, ${money(cards[0].rateUsd)}, ${cards[0].score}% match, est. profit ${money(cards[0].profit)}.`
      : `No eligible return loads near ${city(t.currentCityId)} yet. Try widening the radius or check again later — new loads arrive with every source sync.`;
    return { text, steps, parsed, cards, provider: provider.name };
  }

  // Search & rank (deadhead, profitability and scoring happen inside searchLoads).
  const filters = { ...parsed.filters, truckId: truck?.id, sort: parsed.filters.sort ?? "score" };
  const res = await searchLoads(orgId, userId, filters, 1, 50);
  const eligible = res.rows.filter((r) => r.match?.eligible);
  steps.push(`Searched ${res.total} active loads matching filters → ${eligible.length} your truck${truck ? "" : "s"} can take`);
  steps.push("Calculated deadhead, costs and profit for each (deterministic)");

  // Diversify by route: several near-identical postings of the same lane (common when a load
  // is relisted across brokers/sources) shouldn't fill all 3 recommendation slots — show the
  // best option per distinct origin→destination instead of the same lane three times.
  const sorted = eligible.sort((a, b) => (filters.sort === "profit" ? b.match!.profit.profit - a.match!.profit.profit : b.match!.score - a.match!.score));
  const seenRoutes = new Set<string>();
  const ranked: typeof eligible = [];
  for (const r of sorted) {
    const routeKey = `${r.offer.originCityId}>${r.offer.destCityId}`;
    if (seenRoutes.has(routeKey)) continue;
    seenRoutes.add(routeKey);
    ranked.push(r);
    if (ranked.length >= 3) break;
  }
  const cards = ranked.map((r) => card({ offer: r.offer, match: r.match! }, r.truckCode));

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v != null && v !== "") params.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const searchUrl = `/app/loads?${params.toString()}`;

  if (!cards.length) {
    return {
      text: `I found no loads your ${truck ? `truck ${truck.code}` : "fleet"} can take with these criteria.\n\nYou could: widen the date range, drop the destination, search nearby cities, or lower the minimum rate.`,
      steps, parsed, cards, searchUrl, provider: provider.name,
    };
  }

  if (parsed.intent === "chain" && truck) {
    const chains = await bestChains(orgId, truck, ranked.map((r) => ({ offer: r.offer, match: r.match! })));
    steps.push(`Built ${chains.length} two-leg plans (load + return) ranked by profit per day`);
    const best = chains[0];
    return {
      text: best
        ? `Best plan for ${truck.code}: ${best.legs.map((l) => `${city(l.offer.originCityId)} → ${city(l.offer.destCityId)}`).join(", then ")}.\nTotal profit ${money(best.totalProfit)} over ~${best.days} days (${money(best.profitPerDay)}/day), ${Math.round(best.utilization * 100)}% loaded km.`
        : "I couldn't build a multi-leg plan from the current loads.",
      steps, parsed, cards, searchUrl, provider: provider.name,
      chains: chains.map((c) => ({
        legs: c.legs.map((l) => ({ offerId: l.offer.id, route: `${city(l.offer.originCityId)} → ${city(l.offer.destCityId)}` })),
        totalProfit: c.totalProfit, profitPerDay: c.profitPerDay, days: c.days, utilization: c.utilization,
      })),
    };
  }

  const top = ranked[0].match!;
  const lines = cards.map((c, i) => `${i + 1}. ${c.route} — ${money(c.rateUsd)}, ${c.score}% match, est. profit ${money(c.profit)}${c.truckCode && !truck ? ` (${c.truckCode})` : ""}`);
  const why = top.reasons.slice(0, 3).join(" ");
  const facts = [
    `Matching loads: ${eligible.length}`,
    ...lines,
    `#1 deadhead: ${top.deadheadKm} km; profit/km ${top.profit.profitPerKm}; margin ${Math.round(top.profit.margin * 100)}%`,
    `#1 reasons: ${top.reasons.join(" ")}`,
    `#1 warnings: ${top.warnings.join(" ") || "none"}`,
  ].join("\n");
  const phrased = await provider.summarize(facts, message);
  const text = `I found ${eligible.length} matching load${eligible.length === 1 ? "" : "s"}. Top ${cards.length}:\n\n${lines.join("\n")}\n\n${phrased ?? `I recommend #1: ${why}`}`;
  return { text, steps, parsed, cards, searchUrl, provider: provider.name };
}
