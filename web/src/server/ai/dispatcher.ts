import { db } from "../db";
import { bestChains, findBackhaul } from "../services/backhaul";
import { getMatchTrucks, searchLoads, type LoadRow } from "../services/freight";
import type { MatchTruck } from "../services/matching";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";
import { getProvider } from "./provider";
import type { ParsedQuery } from "./nlsearch";

/**
 * AI dispatcher pipeline:
 * 1 understand intent → 2 identify truck → 3 check capabilities → 4 check location →
 * 5 search loads → 6 deadhead → 7 profitability → 8 rank → 9 explain.
 * Steps 2–8 are deterministic; the LLM (if configured) only parses and phrases.
 * Every sentence shown to the user is built in `i18n`'s language (English when omitted).
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

export async function dispatch(orgId: string, userId: string, message: string, i18n?: I18n): Promise<DispatcherReply> {
  const i = i18n ?? englishI18n();
  const { t, tn, label, city, usd } = i;
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

  const provider = getProvider();
  const now = new Date();
  const parsed = await provider.parseQuery(message, now, i);
  const steps: string[] = [
    t("ai.dispatcher.understood", {
      what: parsed.understood.length ? parsed.understood.join(" · ") : t("ai.dispatcher.generalRequest"),
      parser: parsed.parser === "llm" ? t("ai.dispatcher.parserLlm") : t("ai.dispatcher.parserRule"),
    }),
  ];

  if (parsed.intent === "help") {
    return { text: t("ai.dispatcher.help"), steps, parsed, cards: [], provider: provider.name };
  }

  const trucks = await getMatchTrucks(orgId);
  let truck: MatchTruck | undefined;
  if (parsed.truckCode) {
    truck = trucks.find((x) => x.code.toUpperCase() === parsed.truckCode!.toUpperCase());
    if (!truck) {
      const all = await db.truck.findMany({ where: { orgId }, select: { code: true, status: true } });
      const known = all.find((x) => x.code.toUpperCase() === parsed.truckCode!.toUpperCase());
      return {
        text: known
          ? t("ai.dispatcher.truckBusy", { code: known.code, status: label(known.status).toLowerCase() })
          : t("ai.dispatcher.truckUnknown", { code: parsed.truckCode, list: all.map((x) => x.code).join(", ") || t("ai.dispatcher.noneYet") }),
        steps, parsed, cards: [], provider: provider.name,
      };
    }
    steps.push(t("ai.dispatcher.truckLine", { code: truck.code, cap: (truck.capacityKg / 1000).toFixed(0), body: label(truck.bodyType).toLowerCase(), city: city(truck.currentCityId), date: truck.availableFrom.toISOString().slice(0, 10) }));
  } else if (!trucks.length) {
    return { text: t("ai.dispatcher.noTrucks"), steps, parsed, cards: [], provider: provider.name };
  } else {
    steps.push(t("ai.dispatcher.evaluatingAll", { n: trucks.length }));
  }

  // Backhaul: search around where the truck will be free.
  if (parsed.intent === "backhaul") {
    const tr = truck ?? trucks[0];
    const plan = await findBackhaul(orgId, tr, tr.currentCityId, tr.availableFrom, 120, 3);
    steps.push(t("ai.dispatcher.backhaulSearch", { city: city(tr.currentCityId), date: tr.availableFrom.toISOString().slice(0, 10) }));
    const cards = plan.options.map((o) => card(o, tr.code));
    const text = cards.length
      ? t("ai.dispatcher.backhaulFound", { code: tr.code, city: city(tr.currentCityId), n: plan.totalFound, route: cards[0].route, rate: usd(cards[0].rateUsd), score: cards[0].score, profit: usd(cards[0].profit) })
      : t("ai.dispatcher.backhaulNone", { city: city(tr.currentCityId) });
    return { text, steps, parsed, cards, provider: provider.name };
  }

  // Search & rank (deadhead, profitability and scoring happen inside searchLoads).
  const filters = { ...parsed.filters, truckId: truck?.id, sort: parsed.filters.sort ?? "score" };
  const res = await searchLoads(orgId, userId, filters, 1, 50);
  const eligible = res.rows.filter((r) => r.match?.eligible);
  steps.push(t(truck ? "ai.dispatcher.searchedOne" : "ai.dispatcher.searchedMany", { total: res.total, n: eligible.length }));
  steps.push(t("ai.dispatcher.calculated"));

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
      text: t(truck ? "ai.dispatcher.noLoadsTruck" : "ai.dispatcher.noLoadsFleet", { code: truck?.code ?? "" }),
      steps, parsed, cards, searchUrl, provider: provider.name,
    };
  }

  if (parsed.intent === "chain" && truck) {
    const chains = await bestChains(orgId, truck, ranked.map((r) => ({ offer: r.offer, match: r.match! })));
    steps.push(t("ai.dispatcher.chainsBuilt", { n: chains.length }));
    const best = chains[0];
    return {
      text: best
        ? t("ai.dispatcher.chainBest", {
            code: truck.code,
            legs: best.legs.map((l) => `${city(l.offer.originCityId)} → ${city(l.offer.destCityId)}`).join(t("ai.dispatcher.chainThen")),
            profit: usd(best.totalProfit),
            days: best.days,
            perDay: usd(best.profitPerDay),
            pct: Math.round(best.utilization * 100),
          })
        : t("ai.dispatcher.chainNone"),
      steps, parsed, cards, searchUrl, provider: provider.name,
      chains: chains.map((c) => ({
        legs: c.legs.map((l) => ({ offerId: l.offer.id, route: `${city(l.offer.originCityId)} → ${city(l.offer.destCityId)}` })),
        totalProfit: c.totalProfit, profitPerDay: c.profitPerDay, days: c.days, utilization: c.utilization,
      })),
    };
  }

  const top = ranked[0].match!;
  const lines = cards.map((c, n) => t("ai.dispatcher.cardLine", { n: n + 1, route: c.route, rate: usd(c.rateUsd), score: c.score, profit: usd(c.profit), truck: c.truckCode && !truck ? ` (${c.truckCode})` : "" }));
  const why = top.reasons.slice(0, 3).join(" ");
  // The facts handed to the language model stay in English: it reads them, then answers in the user's language.
  const en = englishI18n();
  const facts = [
    `Matching loads: ${eligible.length}`,
    ...cards.map((c, n) => `${n + 1}. ${c.route} — ${en.usd(c.rateUsd)}, ${c.score}% match, est. profit ${en.usd(c.profit)}${c.truckCode && !truck ? ` (${c.truckCode})` : ""}`),
    `#1 deadhead: ${top.deadheadKm} km; profit/km ${top.profit.profitPerKm}; margin ${Math.round(top.profit.margin * 100)}%`,
    `#1 reasons: ${top.reasons.join(" ")}`,
    `#1 warnings: ${top.warnings.join(" ") || "none"}`,
  ].join("\n");
  const phrased = await provider.summarize(facts, message, i);
  const text = `${tn("ai.dispatcher.found", eligible.length, { top: cards.length })}\n\n${lines.join("\n")}\n\n${phrased ?? t("ai.dispatcher.recommend", { why })}`;
  return { text, steps, parsed, cards, searchUrl, provider: provider.name };
}
