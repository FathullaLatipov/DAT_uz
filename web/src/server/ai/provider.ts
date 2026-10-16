import Anthropic from "@anthropic-ai/sdk";
import { BODY_TYPES, CARGO_TYPES } from "../domain/enums";
import { CITIES, COUNTRIES } from "../domain/geo";
import { normalizeCity } from "../ingestion/normalize";
import { loadFiltersSchema } from "../services/filters";
import { parseQueryRules, type Intent, type ParsedQuery } from "./nlsearch";
import type { I18n } from "../../i18n/create";
import { englishI18n } from "../../i18n/default";

// Language names as the model understands them, for the "answer in …" instruction.
const REPLY_LANGUAGE = { en: "English", ru: "Russian", uz: "Uzbek (Latin script)" } as const;

/**
 * LLM provider abstraction. The LLM is used ONLY for language: turning a request into
 * structured filters and phrasing summaries from facts we computed. Money, distances and
 * scores are always computed by deterministic code.
 */
export interface LLMProvider {
  name: string;
  available(): boolean;
  parseQuery(text: string, now: Date, i18n?: I18n): Promise<ParsedQuery>;
  summarize(facts: string, question: string, i18n?: I18n): Promise<string | null>;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

const QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "truck_code", "origin_city", "dest_city", "dest_country", "origin_country", "weight_min_kg", "body_types", "cargo_types", "loading_from", "loading_to", "rate_per_km_min", "rate_min_usd", "sort"],
  properties: {
    intent: { type: "string", enum: ["search", "recommend", "backhaul", "chain", "help"] },
    truck_code: { type: ["string", "null"], description: "Truck code like T-1024, or null" },
    origin_city: { type: ["string", "null"], description: "Origin city name in English, or null" },
    dest_city: { type: ["string", "null"] },
    origin_country: { type: ["string", "null"], description: "ISO-2 code" },
    dest_country: { type: ["string", "null"], description: "ISO-2 code" },
    weight_min_kg: { type: ["number", "null"] },
    body_types: { type: "array", items: { type: "string", enum: [...BODY_TYPES] } },
    cargo_types: { type: "array", items: { type: "string", enum: [...CARGO_TYPES] } },
    loading_from: { type: ["string", "null"], description: "YYYY-MM-DD" },
    loading_to: { type: ["string", "null"], description: "YYYY-MM-DD" },
    rate_per_km_min: { type: ["number", "null"] },
    rate_min_usd: { type: ["number", "null"] },
    sort: { type: ["string", "null"], enum: ["score", "profit", "rate", "ratePerKm", "loading", "newest", null] },
  },
} as const;

const SYSTEM = `You convert freight search requests from truck owners in Uzbekistan and Central Asia into structured filters.
Requests may be in English, Russian or Uzbek. Known cities: ${CITIES.map((c) => c.name).join(", ")}.
Countries (ISO-2): ${COUNTRIES.map((c) => `${c.code}=${c.name}`).join(", ")}.
Rules: weights in kilograms ("20 ton" → 20000). Use null when something is not stated — never guess.
"profitable" → sort "profit"; "best"/"recommend" → intent "recommend", sort "score".
"return load"/"backhaul" → intent "backhaul". "round trip"/"plan my week" → intent "chain".`;

class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic | null = null;
  available() {
    return !!process.env.ANTHROPIC_API_KEY;
  }
  private get c() {
    return (this.client ??= new Anthropic());
  }

  async parseQuery(text: string, now: Date, i18n?: I18n): Promise<ParsedQuery> {
    const rules = parseQueryRules(text, now, i18n);
    try {
      const res = await this.c.beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: QUERY_SCHEMA } },
        messages: [{ role: "user", content: `Today is ${now.toISOString().slice(0, 10)} (${now.toUTCString().slice(0, 3)}).\nRequest: ${text}` }],
      });
      if (res.stop_reason === "refusal") return rules;
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") return rules;
      const j = JSON.parse(block.text) as Record<string, unknown>;
      const filters = loadFiltersSchema.safeParse({
        origin: normalizeCity(j.origin_city as string) ?? undefined,
        dest: normalizeCity(j.dest_city as string) ?? undefined,
        originCountry: (j.origin_country as string) ?? undefined,
        destCountry: j.dest_city ? undefined : ((j.dest_country as string) ?? undefined),
        weightMin: j.weight_min_kg ?? undefined,
        body: (j.body_types as string[])?.length ? j.body_types : undefined,
        cargo: (j.cargo_types as string[])?.length ? j.cargo_types : undefined,
        loadingFrom: j.loading_from ?? undefined,
        loadingTo: j.loading_to ?? undefined,
        ratePerKmMin: j.rate_per_km_min ?? undefined,
        rateMin: j.rate_min_usd ?? undefined,
        sort: j.sort ?? undefined,
      });
      if (!filters.success) return rules;
      const f = filters.data;
      const L = i18n ?? englishI18n();
      const understood = [
        j.truck_code && L.t("ai.truck", { code: String(j.truck_code) }),
        f.origin && L.t("ai.from", { name: L.city(f.origin) }),
        f.dest && L.t("ai.to", { name: L.city(f.dest) }),
        f.destCountry && L.t("ai.to", { name: L.country(f.destCountry) }),
        f.weightMin && L.t("ai.weightMinT", { n: f.weightMin / 1000 }),
        f.body?.map((b) => L.label(b)).join(", ").toLowerCase(),
        f.cargo?.map((c) => L.label(c)).join(", ").toLowerCase(),
        f.loadingFrom && L.t("ai.loading", { when: `${f.loadingFrom}${f.loadingTo && f.loadingTo !== f.loadingFrom ? ` → ${f.loadingTo}` : ""}` }),
        f.ratePerKmMin && L.t("ai.ratePerKmMin", { n: f.ratePerKmMin }),
      ].filter(Boolean) as string[];
      return { filters: f, truckCode: (j.truck_code as string) ?? rules.truckCode, intent: (j.intent as Intent) ?? rules.intent, understood, parser: "llm" };
    } catch (e) {
      if (e instanceof Anthropic.APIError) console.warn(`[ai] parseQuery fell back to rules: ${e.status} ${e.message}`);
      else console.warn("[ai] parseQuery fell back to rules", e);
      return rules;
    }
  }

  async summarize(facts: string, question: string, i18n?: I18n): Promise<string | null> {
    try {
      const res = await this.c.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system:
          `You are a freight dispatcher assistant for truck owners. Write a short, direct recommendation (max 90 words) using ONLY the numbers in FACTS — never invent or recompute figures. Plain text, no markdown headings. Answer in ${REPLY_LANGUAGE[i18n?.locale ?? "en"]}.`,
        messages: [{ role: "user", content: `QUESTION: ${question}\n\nFACTS:\n${facts}` }],
      });
      if (res.stop_reason === "refusal") return null;
      const block = res.content.find((b) => b.type === "text");
      return block && block.type === "text" ? block.text.trim() : null;
    } catch (e) {
      console.warn("[ai] summarize failed", e instanceof Anthropic.APIError ? e.status : e);
      return null;
    }
  }
}

class RulesProvider implements LLMProvider {
  name = "rules";
  available() {
    return true;
  }
  async parseQuery(text: string, now: Date, i18n?: I18n) {
    return parseQueryRules(text, now, i18n);
  }
  async summarize() {
    return null;
  }
}

const anthropic = new AnthropicProvider();
const rules = new RulesProvider();

export function getProvider(): LLMProvider {
  if (process.env.AI_PROVIDER === "rules") return rules;
  return anthropic.available() ? anthropic : rules;
}
