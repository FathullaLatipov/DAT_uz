import { getCity } from "../../domain/geo";
import { generateDemoLoads, mulberry32, type DemoLoad } from "../demo/generator";
import type { FreightSourceAdapter, ParsedListing } from "../types";

const DAY = 86_400_000;

// Russian-language vocabulary used by "Demo Exchange B" to exercise normalization.
const RU_CITY: Record<string, string> = {
  tashkent: "Ташкент", samarkand: "Самарканд", bukhara: "Бухара", andijan: "Андижан", namangan: "Наманган",
  fergana: "Фергана", qarshi: "Карши", termez: "Термез", nukus: "Нукус", navoi: "Навои", jizzakh: "Джизак",
  gulistan: "Гулистан", urgench: "Ургенч", almaty: "Алматы", astana: "Астана", shymkent: "Шымкент",
  bishkek: "Бишкек", dushanbe: "Душанбе", moscow: "Москва", yekaterinburg: "Екатеринбург", kazan: "Казань",
  urumqi: "Урумчи", kashgar: "Кашгар", istanbul: "Стамбул", baku: "Баку", tbilisi: "Тбилиси", minsk: "Минск",
  ashgabat: "Ашхабад", yerevan: "Ереван",
};
const RU_BODY: Record<string, string> = {
  CURTAINSIDER: "тент", BOX: "изотерм", REFRIGERATED: "рефрижератор", FLATBED: "площадка", OPEN: "бортовой",
  TANKER: "цистерна", CONTAINER: "контейнер", CAR_CARRIER: "автовоз", LOWBED: "трал",
};
const RU_CARGO: Record<string, string> = {
  GENERAL: "ТНП", FOOD: "продукты питания", PRODUCE: "фрукты/овощи", TEXTILES: "текстиль", COTTON: "хлопок",
  CONSTRUCTION: "стройматериалы", EQUIPMENT: "оборудование", CHEMICALS: "химия", FUEL: "ГСМ", VEHICLES: "автомобили",
  ELECTRONICS: "электроника", FURNITURE: "мебель", METAL: "металлопрокат",
};
const RU_PAY: Record<string, string> = {
  PREPAID: "предоплата", ON_LOADING: "на загрузке", ON_UNLOADING: "на выгрузке", NET_7: "7 дней", NET_14: "14 дней", NET_30: "30 дней",
};
const RU_CUR: Record<string, string> = { USD: "долл", UZS: "сум", RUB: "руб", KZT: "тенге", CNY: "юань", EUR: "евро" };

const ruDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
const parseRuDate = (s: string) => {
  const [dd, mm, yyyy] = s.split(".").map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd, 9));
};

let cache: { at: number; loads: DemoLoad[] } | null = null;
/** Demo market is anchored to the day it is generated so dates stay realistic. */
function demoLoads() {
  const today = new Date();
  today.setUTCHours(6, 0, 0, 0);
  if (!cache || cache.at !== today.getTime()) cache = { at: today.getTime(), loads: generateDemoLoads(today) };
  return cache.loads;
}

/** Demo Exchange A — English JSON feed, kilograms, ISO dates. */
export const demoExchangeA: FreightSourceAdapter = {
  descriptor: {
    id: "demo-exchange-a",
    name: "Demo Exchange A",
    kind: "DEMO",
    isDemo: true,
    accessNotes: "Synthetic English-language JSON feed generated locally. DEMO DATA — not a real marketplace.",
  },
  isConfigured: () => true,
  async fetch() {
    return demoLoads()
      .filter((l) => l.channels.includes("A"))
      .map((l): ParsedListing => {
        const raw = {
          id: `A-${l.key}`,
          from: `${getCity(l.origin)!.name}, ${getCity(l.origin)!.country}`,
          to: `${getCity(l.dest)!.name}, ${getCity(l.dest)!.country}`,
          load_date: l.loadingDate.toISOString(),
          unload_date: l.unloadingDate.toISOString(),
          cargo: l.cargo.toLowerCase(),
          weight_kg: l.weightKg,
          volume_m3: l.volumeM3,
          body: l.body.toLowerCase().replace("_", " "),
          price: l.rate,
          currency: l.currency,
          payment: l.payment.toLowerCase(),
          company: `${l.broker} LLC`,
          posted_at: l.postedAt.toISOString(),
        };
        return {
          externalId: raw.id,
          origin: raw.from,
          destination: raw.to,
          loadingDate: raw.load_date,
          unloadingDate: raw.unload_date,
          cargo: raw.cargo,
          weight: raw.weight_kg,
          weightUnit: "kg",
          volume: raw.volume_m3,
          bodyType: raw.body,
          rate: raw.price,
          currency: raw.currency,
          paymentTerms: raw.payment,
          broker: raw.company,
          postedAt: raw.posted_at,
          expiresAt: new Date(l.loadingDate.getTime() + DAY),
          raw,
        };
      });
  },
};

/** Demo Exchange B — Russian-language board, tonnes, dd.mm.yyyy dates, local currencies, a few broken rows. */
export const demoExchangeB: FreightSourceAdapter = {
  descriptor: {
    id: "demo-exchange-b",
    name: "Demo Exchange B",
    kind: "DEMO",
    isDemo: true,
    accessNotes: "Synthetic Russian-language feed with intentionally messy rows to exercise normalization and data-quality checks. DEMO DATA.",
  },
  isConfigured: () => true,
  async fetch() {
    const rnd = mulberry32(7);
    const rows = demoLoads()
      .filter((l) => l.channels.includes("B"))
      .map((l, i) => {
        // Same load reposted on another board: slightly different price, same day, Cyrillic everything.
        const jitter = l.channels.includes("A") ? 0.97 + rnd() * 0.06 : 1;
        return {
          num: 700000 + i,
          откуда: RU_CITY[l.origin] ?? l.origin,
          куда: RU_CITY[l.dest] ?? l.dest,
          дата_загрузки: ruDate(l.loadingDate),
          груз: RU_CARGO[l.cargo],
          вес: `${(l.weightKg / 1000).toString().replace(".", ",")} т`,
          объем: `${l.volumeM3} м3`,
          кузов: RU_BODY[l.body],
          ставка: Math.round(l.rate * jitter),
          валюта: RU_CUR[l.currency],
          оплата: RU_PAY[l.payment],
          фирма: `ООО «${l.broker}»`,
          размещено: l.postedAt.toISOString(),
          _exp: new Date(l.loadingDate.getTime() + DAY).toISOString(),
        };
      });

    // Intentionally broken rows — the quality layer must reject or flag them.
    const today = ruDate(new Date());
    rows.push(
      { num: 799001, откуда: "Чирчик-2", куда: "Москва", дата_загрузки: today, груз: "ТНП", вес: "20 т", объем: "86 м3", кузов: "тент", ставка: 3500, валюта: "долл", оплата: "на выгрузке", фирма: "ООО «Kyzylkum Haulage»", размещено: new Date().toISOString(), _exp: "" },
      { num: 799002, откуда: "Ташкент", куда: "", дата_загрузки: today, груз: "ТНП", вес: "20 т", объем: "", кузов: "тент", ставка: 900, валюта: "долл", оплата: "", фирма: "", размещено: new Date().toISOString(), _exp: "" },
      { num: 799003, откуда: "Самарканд", куда: "Алматы", дата_загрузки: today, груз: "мебель", вес: "—", объем: "", кузов: "тент", ставка: 1200, валюта: "долл", оплата: "", фирма: "ООО «Chimgan Trade House»", размещено: new Date().toISOString(), _exp: "" },
      { num: 799004, откуда: "Бухара", куда: "Ташкент", дата_загрузки: today, груз: "хлопок", вес: "18 т", объем: "", кузов: "тент", ставка: 95, валюта: "долл", оплата: "на выгрузке", фирма: "ООО «Amu Darya Freight»", размещено: new Date().toISOString(), _exp: "" },
      { num: 799005, откуда: "Ташкент", куда: "Бишкек", дата_загрузки: today, груз: "ТНП", вес: "12 т", объем: "", кузов: "тент", ставка: 1100, валюта: "манат", оплата: "", фирма: "ООО «Tien Shan Forwarding»", размещено: new Date().toISOString(), _exp: "" },
    );

    return rows.map(
      (r): ParsedListing => ({
        externalId: String(r.num),
        origin: r.откуда,
        destination: r.куда,
        loadingDate: parseRuDate(r.дата_загрузки),
        cargo: r.груз,
        weight: r.вес,
        volume: r.объем,
        bodyType: r.кузов,
        rate: r.ставка,
        currency: r.валюта,
        paymentTerms: r.оплата,
        broker: r.фирма || undefined,
        postedAt: r.размещено,
        expiresAt: r._exp || undefined,
        raw: r,
      }),
    );
  },
};

/** CSV rows for the manual-import demo file (same schema an operator would upload). */
export function demoCsv(): string {
  const header = "external_id,origin,destination,loading_date,unloading_date,cargo,weight_kg,volume_m3,body_type,rate,currency,payment_terms,broker,posted_at";
  const lines = demoLoads()
    .filter((l) => l.channels.includes("CSV"))
    .map((l) =>
      [
        `CSV-${l.key}`,
        getCity(l.origin)!.name,
        getCity(l.dest)!.name,
        l.loadingDate.toISOString().slice(0, 10),
        l.unloadingDate.toISOString().slice(0, 10),
        l.cargo,
        l.weightKg,
        l.volumeM3,
        l.body,
        l.rate,
        l.currency,
        l.payment,
        `"${l.broker}"`,
        l.postedAt.toISOString(),
      ].join(","),
    );
  return [header, ...lines].join("\n");
}
