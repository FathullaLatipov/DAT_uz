/**
 * Seeds reference data + a DEMO market. Everything generated here is fictional and flagged
 * isDemo=true; the UI shows a DEMO DATA badge wherever it appears.
 *
 * Run: npm run db:seed   (also runs on `prisma migrate reset`)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CITIES, COUNTRIES, estimateRoadKm, estimateTransitDays } from "../src/server/domain/geo";
import { defaultRates } from "../src/server/domain/currency";
import { runIngestion } from "../src/server/ingestion/pipeline";
import { demoCsv, demoExchangeA, demoExchangeB } from "../src/server/ingestion/adapters/demo";
import { manualImportAdapter } from "../src/server/ingestion/adapters/csv";
import { externalAdapters } from "../src/server/ingestion/adapters/external";
import { mulberry32 } from "../src/server/ingestion/demo/generator";
import { computeProfit, estimateTollsUsd } from "../src/server/services/profitability";

const db = new PrismaClient();
const rnd = mulberry32(99);
const DAY = 86_400_000;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

async function reset() {
  // Children first.
  await db.$transaction([
    db.aIMessage.deleteMany(), db.aIConversation.deleteMany(), db.notification.deleteMany(), db.recommendation.deleteMany(),
    db.favorite.deleteMany(), db.savedSearch.deleteMany(), db.trip.deleteMany(), db.truckLocation.deleteMany(),
    db.brokerReview.deleteMany(), db.freightListing.deleteMany(), db.freightOffer.deleteMany(), db.broker.deleteMany(),
    db.ingestionRun.deleteMany(), db.freightSource.deleteMany(), db.truck.deleteMany(), db.driver.deleteMany(),
    db.preferredRoute.deleteMany(), db.orgPreference.deleteMany(), db.membership.deleteMany(), db.user.deleteMany(),
    db.organization.deleteMany(), db.city.deleteMany(), db.country.deleteMany(), db.exchangeRate.deleteMany(), db.auditLog.deleteMany(),
  ]);
}

const DRIVER_NAMES = [
  "Bekzod R.", "Javlon T.", "Sardor M.", "Ulugbek K.", "Rustam A.", "Akmal S.", "Doniyor Kh.", "Farrukh N.", "Otabek Y.", "Shavkat I.",
  "Timur B.", "Aziz U.", "Jasur E.", "Sherzod P.", "Nodir G.", "Anvar Z.", "Ravshan D.", "Ilhom F.", "Kamol V.", "Behruz L.",
];

type TruckSeed = { code: string; type: string; body: string; cap: number; vol: number; city: string; status: string; fuel?: number };

const DEMO_FLEET: TruckSeed[] = [
  { code: "T-1024", type: "SEMI", body: "CURTAINSIDER", cap: 20000, vol: 86, city: "tashkent", status: "AVAILABLE" },
  { code: "T-1025", type: "SEMI", body: "REFRIGERATED", cap: 20000, vol: 82, city: "samarkand", status: "AVAILABLE", fuel: 34 },
  { code: "T-1031", type: "SEMI", body: "CURTAINSIDER", cap: 22000, vol: 90, city: "tashkent", status: "IN_TRANSIT" },
  { code: "T-1032", type: "SEMI", body: "REFRIGERATED", cap: 18000, vol: 76, city: "fergana", status: "AVAILABLE", fuel: 33 },
  { code: "T-1040", type: "RIGID", body: "BOX", cap: 10000, vol: 45, city: "tashkent", status: "MAINTENANCE", fuel: 24 },
  { code: "T-1041", type: "SEMI", body: "CURTAINSIDER", cap: 20000, vol: 86, city: "fergana", status: "IN_TRANSIT" },
  { code: "T-1052", type: "SEMI", body: "FLATBED", cap: 22000, vol: 60, city: "bukhara", status: "AVAILABLE" },
];

async function main() {
  console.log("Resetting…");
  await reset();

  console.log("Reference data…");
  for (const c of COUNTRIES) await db.country.create({ data: { code: c.code, name: c.name } });
  for (const c of CITIES)
    await db.city.create({ data: { id: c.id, name: c.name, countryCode: c.country, lat: c.lat, lng: c.lng, aliases: JSON.stringify(c.aliases), isHub: !!c.hub } });
  for (const [currency, perUsd] of Object.entries(defaultRates()))
    await db.exchangeRate.create({ data: { currency, perUsd, asOf: new Date(), source: "Manual reference rate (demo) — connect a live FX feed" } });

  console.log("Organizations & users…");
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const demoOrg = await db.organization.create({ data: { name: "Silk Road Haulage", plan: "FLEET", isDemo: true } });
  const demoUser = await db.user.create({ data: { email: "demo@karvon.uz", name: "Dilshod Karimov", passwordHash: hash("demo1234") } });
  const admin = await db.user.create({ data: { email: "admin@karvon.uz", name: "Platform Admin", passwordHash: hash("admin1234"), platformRole: "ADMIN" } });
  const dispatcher = await db.user.create({ data: { email: "dispatcher@karvon.uz", name: "Malika Yusupova", passwordHash: hash("demo1234") } });
  await db.membership.createMany({
    data: [
      { userId: demoUser.id, orgId: demoOrg.id, role: "COMPANY_ADMIN", accountType: "FLEET_MANAGER" },
      { userId: admin.id, orgId: demoOrg.id, role: "COMPANY_ADMIN", accountType: "LOGISTICS_COMPANY" },
      { userId: dispatcher.id, orgId: demoOrg.id, role: "DISPATCHER", accountType: "DISPATCHER" },
    ],
  });
  await db.orgPreference.create({
    data: { orgId: demoOrg.id, minRatePerKmUsd: 1.1, maxDeadheadKm: 150, preferredCargo: JSON.stringify(["TEXTILES", "FOOD", "PRODUCE", "GENERAL"]), preferredCountries: JSON.stringify(["KZ", "RU", "KG"]), paymentTerms: JSON.stringify([]) },
  });
  await db.preferredRoute.createMany({
    data: [
      { orgId: demoOrg.id, originCityId: "tashkent", destCityId: "almaty" },
      { orgId: demoOrg.id, originCityId: "tashkent", destCityId: "astana" },
      { orgId: demoOrg.id, originCityId: "tashkent", destCityId: "moscow" },
      { orgId: demoOrg.id, originCityId: "tashkent", destCityId: "bishkek" },
      { orgId: demoOrg.id, originCityId: "fergana", destCountry: "RU" },
    ],
  });

  const otherOrgs = await Promise.all(
    ["Fergana Reefer Co-op", "Turon Express Fleet", "Owner-operator A. Saidov", "Orient Truck Partners"].map((name, i) =>
      db.organization.create({ data: { name, plan: i === 2 ? "PRO" : "FLEET", isDemo: true } }),
    ),
  );

  console.log("Fleet…");
  const mkDriver = (orgId: string) => db.driver.create({ data: { orgId, name: DRIVER_NAMES[Math.floor(rnd() * DRIVER_NAMES.length)], licenseClass: "CE" } });
  const demoTrucks = [];
  for (const t of DEMO_FLEET) {
    const driver = await mkDriver(demoOrg.id);
    demoTrucks.push(
      await db.truck.create({
        data: {
          orgId: demoOrg.id, code: t.code, plate: `01 ${100 + demoTrucks.length * 7} DEMO`, truckType: t.type, bodyType: t.body, capacityKg: t.cap, volumeM3: t.vol,
          currentCityId: t.city, status: t.status, driverId: driver.id, fuelLPer100km: t.fuel ?? 32,
          availableFrom: t.code === "T-1032" ? new Date(Date.now() + DAY) : new Date(),
        },
      }),
    );
  }
  // 23 market trucks in other organizations — they make the supply side of analytics non-empty.
  const hubs = ["tashkent", "tashkent", "tashkent", "samarkand", "fergana", "andijan", "bukhara", "almaty", "almaty", "bishkek", "shymkent", "moscow", "qarshi", "namangan", "urumqi"];
  const bodies = ["CURTAINSIDER", "CURTAINSIDER", "CURTAINSIDER", "REFRIGERATED", "REFRIGERATED", "BOX", "FLATBED", "OPEN"];
  for (let i = 0; i < 23; i++) {
    const org = otherOrgs[i % otherOrgs.length];
    const driver = await mkDriver(org.id);
    await db.truck.create({
      data: {
        orgId: org.id, code: `T-${2000 + i}`, truckType: "SEMI", bodyType: pick(bodies), capacityKg: pick([18000, 20000, 20000, 22000]),
        volumeM3: pick([76, 82, 86, 90]), currentCityId: pick(hubs), status: rnd() < 0.8 ? "AVAILABLE" : "IN_TRANSIT", driverId: driver.id,
      },
    });
  }

  console.log("Ingesting demo sources (normalize → dedupe → store)…");
  for (const a of [demoExchangeA, demoExchangeB, manualImportAdapter(demoCsv(), { isDemo: true }), ...externalAdapters]) {
    const s = await runIngestion(db, a);
    console.log(`  ${s.sourceId.padEnd(18)} ${s.status.padEnd(8)} fetched=${s.fetched} created=${s.created} dup=${s.duplicates} rejected=${s.rejected} errors=${s.errors}`);
  }

  console.log("Brokers: demo verification & reviews…");
  const brokers = await db.broker.findMany({ orderBy: { name: "asc" } });
  for (const [i, b] of brokers.entries()) {
    const verified = i % 3 !== 2;
    await db.broker.update({
      where: { id: b.id },
      data: { verified, verificationMethod: verified ? "Demo verification (no real registry check)" : null, countryCode: pick(["UZ", "UZ", "UZ", "KZ", "RU"]), isDemo: true },
    });
    const nReviews = i % 4 === 3 ? Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 8); // some brokers stay below the minimum
    const quality = 0.55 + rnd() * 0.45;
    for (let r = 0; r < nReviews; r++) {
      await db.brokerReview.create({
        data: {
          brokerId: b.id, orgId: pick(otherOrgs).id, isDemo: true,
          rating: Math.max(1, Math.min(5, Math.round(quality * 5 + (rnd() - 0.5) * 1.5))),
          paidOnTime: rnd() < quality + 0.1, disputed: rnd() > quality + 0.3, cancelled: rnd() > quality + 0.35,
          createdAt: new Date(Date.now() - rnd() * 90 * DAY),
        },
      });
    }
  }
  // Re-derive quality now that broker verification is known.
  const verifiedIds = (await db.broker.findMany({ where: { verified: true }, select: { id: true } })).map((b) => b.id);
  await db.freightOffer.updateMany({ where: { brokerId: { in: verifiedIds }, quality: "PARTIAL", qualityFlags: "[]" }, data: { quality: "VERIFIED" } });

  console.log("Trips (history + in-transit)…");
  const lanes: [string, string, number][] = [
    ["tashkent", "almaty", 1.48], ["almaty", "tashkent", 1.28], ["tashkent", "moscow", 1.15], ["fergana", "moscow", 1.18], ["tashkent", "bishkek", 1.5],
    ["samarkand", "tashkent", 1.55], ["tashkent", "samarkand", 1.7], ["bukhara", "tashkent", 1.5], ["tashkent", "astana", 1.32], ["urumqi", "tashkent", 1.55],
  ];
  for (const t of demoTrucks) {
    if (t.status === "MAINTENANCE") continue;
    let cursor = Date.now() - 58 * DAY;
    while (cursor < Date.now() - 4 * DAY) {
      const [o, d, perKm] = pick(lanes);
      const km = estimateRoadKm(o, d);
      const empty = Math.round(rnd() < 0.5 ? 0 : 20 + rnd() * 160);
      const revenue = Math.round(km * perKm * (0.9 + rnd() * 0.2));
      const p = computeProfit({ ...t, revenueUsd: revenue, loadedKm: km, deadheadKm: empty, tollsUsd: estimateTollsUsd(km, CITIES.find((c) => c.id === o)!.country, CITIES.find((c) => c.id === d)!.country) });
      const days = estimateTransitDays(km);
      await db.trip.create({
        data: {
          orgId: demoOrg.id, truckId: t.id, originCityId: o, destCityId: d, status: "COMPLETED", isDemo: true,
          startedAt: new Date(cursor), completedAt: new Date(cursor + days * DAY), etaAt: new Date(cursor + days * DAY),
          revenueUsd: revenue, costUsd: p.totalCost, loadedKm: km, emptyKm: empty,
        },
      });
      cursor += (days + 1 + rnd() * 3) * DAY;
    }
  }
  const inTransit: Record<string, [string, string, number]> = { "T-1031": ["tashkent", "almaty", 1.6], "T-1041": ["fergana", "moscow", 1.2] };
  for (const t of demoTrucks.filter((x) => x.status === "IN_TRANSIT")) {
    const [o, d, perKm] = inTransit[t.code];
    const km = estimateRoadKm(o, d);
    const started = Date.now() - DAY;
    const eta = started + estimateTransitDays(km) * DAY;
    await db.trip.create({
      data: {
        orgId: demoOrg.id, truckId: t.id, originCityId: o, destCityId: d, status: "IN_TRANSIT", isDemo: true,
        startedAt: new Date(started), etaAt: new Date(eta), revenueUsd: Math.round(km * perKm), costUsd: Math.round(km * 0.75), loadedKm: km, emptyKm: 0,
      },
    });
    await db.truck.update({ where: { id: t.id }, data: { availableFrom: new Date(eta) } });
  }

  console.log("Saved search & notifications…");
  await db.savedSearch.create({
    data: {
      orgId: demoOrg.id, userId: demoUser.id, name: "Tashkent → Kazakhstan, 20 t curtainsider",
      filters: JSON.stringify({ origin: "tashkent", destCountry: "KZ", weightMin: 15000, body: ["CURTAINSIDER"], ratePerKmMin: 1.3 }),
      channels: JSON.stringify(["WEB", "TELEGRAM"]), lastCheckedAt: new Date(Date.now() - 2 * DAY),
    },
  });
  await db.notification.createMany({
    data: [
      { userId: demoUser.id, type: "SYSTEM", title: "Welcome to Karvon", body: "You're exploring a demo workspace. All freight, brokers and market numbers are DEMO DATA.", link: "/app" },
      { userId: demoUser.id, type: "BACKHAUL", title: "T-1031 arrives in Almaty soon", body: "We're looking for return loads near Almaty for your truck.", link: "/app/fleet" },
    ],
  });

  const [offers, active, listings] = await Promise.all([db.freightOffer.count(), db.freightOffer.count({ where: { status: "ACTIVE" } }), db.freightListing.count()]);
  console.log(`\nDone. ${offers} offers (${active} active) from ${listings} source listings, ${brokers.length} brokers, 30 trucks.`);
  console.log("Login: demo@karvon.uz / demo1234   ·   admin@karvon.uz / admin1234   ·   dispatcher@karvon.uz / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
