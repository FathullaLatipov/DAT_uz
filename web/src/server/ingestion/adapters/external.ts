import type { FreightSourceAdapter, SourceDescriptor } from "../types";

/**
 * Placeholders for third-party freight boards. None of them fetch anything.
 *
 * Policy (see README › Data sources): we integrate only through an official API, a licensed
 * feed or a partner agreement. No scraping, no bypassing logins/CAPTCHAs/paywalls. Each adapter
 * becomes "configured" only when its credentials env var is set AND someone has implemented
 * `fetch()` against the provider's documented API under a signed agreement.
 */
function notConfigured(d: Omit<SourceDescriptor, "kind" | "isDemo">, envVar: string): FreightSourceAdapter {
  return {
    descriptor: { ...d, kind: "PARTNER", isDemo: false, accessNotes: `${d.accessNotes} Credentials env: ${envVar}.` },
    isConfigured: () => false,
    async fetch() {
      throw new Error(`${d.name}: integration not configured`);
    },
  };
}

export const externalAdapters: FreightSourceAdapter[] = [
  notConfigured(
    {
      id: "ati-su",
      name: "ATI.SU",
      homepage: "https://ati.su",
      accessNotes:
        "Largest CIS freight exchange. ATI publishes a developer API for registered participants; using its data in a third-party aggregator requires confirming licence terms with ATI. Integration not configured.",
    },
    "ATI_API_TOKEN",
  ),
  notConfigured(
    {
      id: "lardi-trans",
      name: "Lardi-Trans",
      homepage: "https://lardi-trans.com",
      accessNotes: "Freight exchange popular in Ukraine/CIS/EU. Check API availability and redistribution terms under a partner agreement. Integration not configured.",
    },
    "LARDI_API_KEY",
  ),
  notConfigured(
    {
      id: "della",
      name: "DELLA",
      homepage: "https://della.eu",
      accessNotes: "Freight exchange (EU/CIS). No public API assumed — requires a partnership or licensed export. Integration not configured.",
    },
    "DELLA_API_KEY",
  ),
  notConfigured(
    {
      id: "yuk-uz",
      name: "YUK.UZ",
      homepage: "https://yuk.uz",
      accessNotes: "Uzbekistan freight board. Integration path to be agreed with the operator. Integration not configured.",
    },
    "YUKUZ_API_KEY",
  ),
  notConfigured(
    {
      id: "cargoinfo",
      name: "Cargoinfo.uz",
      homepage: "https://www.cargoinfo.uz",
      accessNotes:
        "Cargo.lt-based exchange. robots.txt disallows /api/ and list pages, so we do not crawl it. Needs an official export or feed from the operators (they offer CSV import/export); then map it here. Integration not configured.",
    },
    "CARGOINFO_FEED_URL",
  ),
  notConfigured(
    {
      id: "e-logistika",
      name: "E-Logistika",
      accessNotes: "Uzbekistan logistics platform. Integration path to be agreed with the operator. Integration not configured.",
    },
    "ELOGISTIKA_API_KEY",
  ),
];
