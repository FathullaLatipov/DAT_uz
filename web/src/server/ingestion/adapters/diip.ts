import type { FreightSourceAdapter, ParsedListing } from "../types";

/**
 * DIIP.UZ adapter.
 *
 * Reads DIIP's public JSON endpoint (the one diip.uz itself uses for its public pages):
 *   GET https://api.diip.uz/api/public-seo/loads?limit=100&page=N
 * robots.txt on diip.uz allows crawling, and DIIP's operators gave the project owner
 * permission to import their loads. We stay polite: identifying User-Agent with a contact
 * address, one request per second, a hard page cap, and no contact details are requested
 * (the endpoint doesn't expose any).
 *
 * Enabled with DIIP_SYNC=on. Tunables: DIIP_MAX_PAGES (default 5), DIIP_CONTACT.
 */

const BASE = "https://api.diip.uz/api/public-seo/loads";
const PAGE_SIZE = 100;

/** DIIP locates loads by region/oblast. We map them to the nearest hub city we model. */
const REGION_TO_CITY: Record<string, string> = {
  // Uzbekistan
  "toshkent-viloyati": "tashkent", "toshkent-poytaxt": "tashkent", "fargona-viloyati": "fergana", "andijon-viloyati": "andijan",
  "namangan-viloyati": "namangan", "samarqand-viloyati": "samarkand", "buxoro-viloyati": "bukhara", "navoiy-viloyati": "navoi",
  "jizzax-viloyati": "jizzakh", "sirdaryo-viloyati": "gulistan", "qashqadaryo-viloyati": "qarshi", "surxondaryo-viloyati": "termez",
  "xorazm-viloyati": "urgench", "qoraqalpogiston-respublikasi": "nukus",
  // Kazakhstan
  almat: "almaty", "almat-viloyati": "almaty", "jetisu-viloyati": "almaty", "astana-poytaxt": "astana", "aqmola-viloyati": "astana",
  shymkent: "shymkent", "turkiston-viloyati": "shymkent",
  // Kyrgyzstan
  "bishkek-poytaxt": "bishkek", "chuy-viloyati": "bishkek", "osh-shahar": "osh", "osh-viloyati": "osh", "jalolobod-viloyati": "osh",
  // Tajikistan, Turkmenistan
  "dushanbe-poytaxt": "dushanbe", "sugd-viloyati": "khujand", "ashgabat-poytaxt": "ashgabat", "ahal-viloyati": "ashgabat",
  // Caucasus, Belarus
  "tbilisi-poytaxt": "tbilisi", "yerevan-poytaxt": "yerevan", "minsk-poytaxt": "minsk", "minsk-viloyati": "minsk",
  // Russia
  moskva: "moscow", "moskva-viloyati": "moscow", "sverdlovsk-viloyati": "yekaterinburg", "novosibirsk-viloyati": "novosibirsk",
  "tatariston-respublikasi": "kazan", "sankt-peterburg": "saint-petersburg", "krasnodar-olkasi": "krasnodar", "rostov-viloyati": "rostov",
  "nijniy-novgorod-viloyati": "nizhny-novgorod",
  // China, Turkey
  "shinjon-uygur-avtonom-rayoni": "urumqi", istanbul: "istanbul", izmir: "izmir", "boku-poytaxt": "baku", ankara: "ankara",
};

interface DiipLoad {
  id: string;
  status: string;
  createdByType: string;
  from: { slug: string; name: string; nameRu: string };
  to: { slug: string; name: string; nameRu: string };
  vehicleType: { slug: string; name: string; nameRu: string } | null;
  title: string | null;
  weight: string | null;
  volume: string | null;
  price: string | null;
  currency: string | null;
  isPriceNegotiable: boolean;
  paymentType: string | null;
  loadingDate: string;
  isDogruz: boolean;
  additionalInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

const PAYMENT: Record<string, string> = { cash: "on_unloading", prepaid: "prepaid", transfer: "net_7" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function userAgent() {
  return `KarvonBot/0.1 (contact: ${process.env.DIIP_CONTACT ?? "hotamtoyku@gmail.com"})`;
}

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": userAgent(), Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    if (res.status === 429 || res.status >= 500) throw new Error(`DIIP responded ${res.status} — backing off`);
    if (!res.ok) throw new Error(`DIIP responded ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Unmapped locations are reported (not guessed) so the mapping table can be extended. */
function toListing(d: DiipLoad): ParsedListing {
  const from = REGION_TO_CITY[d.from?.slug];
  const to = REGION_TO_CITY[d.to?.slug];
  const weightT = d.weight ? Number(d.weight) : NaN;
  const price = d.price ? Number(d.price) : 0;
  return {
    externalId: d.id,
    // Raw location slugs flow through; the normalizer rejects anything it can't place and the
    // admin panel shows the message. Mapped values are canonical city ids.
    origin: from ?? `unmapped:${d.from?.slug}`,
    destination: to ?? `unmapped:${d.to?.slug}`,
    loadingDate: d.loadingDate,
    cargo: d.title ?? undefined,
    weight: Number.isFinite(weightT) ? Math.round(weightT * 1000) : undefined,
    weightUnit: "kg",
    volume: d.volume ?? undefined,
    bodyType: d.vehicleType?.nameRu ?? d.vehicleType?.name,
    rate: d.isPriceNegotiable || price <= 0 ? null : price,
    currency: d.currency ?? undefined,
    paymentTerms: d.paymentType ? PAYMENT[d.paymentType] : undefined,
    requirements: [d.isDogruz ? "Partial load (догруз)" : "", d.additionalInfo ?? ""].filter(Boolean).map((s) => s.slice(0, 120)),
    postedAt: d.createdAt,
    raw: d,
  };
}

export const diipAdapter: FreightSourceAdapter = {
  descriptor: {
    id: "diip",
    name: "DIIP.UZ",
    kind: "FEED",
    isDemo: false,
    homepage: "https://diip.uz",
    accessNotes:
      "Public JSON endpoint used by diip.uz public pages (api.diip.uz/api/public-seo/loads). robots.txt allows access; DIIP operators gave the project owner permission. Identifying User-Agent, 1 request/second, page-capped. No contact details are exposed. Enable with DIIP_SYNC=on.",
  },
  isConfigured: () => process.env.DIIP_SYNC === "on",
  async fetch() {
    const maxPages = Math.max(1, Math.min(30, Number(process.env.DIIP_MAX_PAGES) || 5));
    const out: ParsedListing[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const r = await getJson<{ data: DiipLoad[]; pagination: { total: number } }>(`${BASE}?limit=${PAGE_SIZE}&page=${page}`);
      for (const d of r.data) if (d.status === "active") out.push(toListing(d));
      if (r.data.length < PAGE_SIZE || page * PAGE_SIZE >= r.pagination.total) break;
      await sleep(1000);
    }
    return out;
  },
};
