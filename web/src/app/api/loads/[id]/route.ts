import { NextResponse, type NextRequest } from "next/server";
import { db, parseJson } from "@/server/db";
import { api, errorResponse, HttpError, localize } from "@/server/http";
import { getI18n } from "@/i18n/server";
import { can } from "@/server/auth/permissions";
import { getSession } from "@/server/auth/session";
import { audit, rateLimit } from "@/server/security";
import { PLATFORM_SOURCE } from "@/server/ingestion/pipeline";
import { getOfferDetail } from "@/server/services/freight";
import { invalidateMarketCache, laneStats } from "@/server/services/market";
import { brokerReliability } from "@/server/services/broker";
import { findBackhaul } from "@/server/services/backhaul";
import { estimateTollsUsd } from "@/server/services/profitability";
import { legsFor } from "@/server/services/routing";
import { fuelTable } from "@/server/services/fuel";
import { effectiveFuelPrice } from "@/server/domain/fuel";
import { borderSummary, typicalBorderHours } from "@/server/domain/borders";
import { tripTime } from "@/server/domain/hos";
import { distancesFor } from "@/server/domain/route-profile";
import { estimateTransitDays, freshGps, getCity } from "@/server/domain/geo";
import { senderOf, uniqueContacts } from "@/server/services/contacts";

const DAY = 86_400_000;

/**
 * Load detail as JSON — backs the expandable-row panel on both the public catalog and the
 * authenticated board (and could replace the full-page fetches too, though those stay as
 * server-rendered pages for direct-URL/SEO access). No session required: an anonymous caller
 * gets the same public-safe fields the /load/[id] page already renders; a signed-in caller
 * additionally gets per-truck matches, broker reliability, backhaul and contact details —
 * exactly the authenticated-only fields /app/loads/[id] already gates.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    const rl = rateLimit(`load-detail:${session?.userId ?? req.headers.get("x-forwarded-for") ?? "anon"}`, 120, 60_000);
    if (!rl.ok) return NextResponse.json({ error: await localize("Too many requests — please slow down.") }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });

    if (!session) {
      const offer = await db.freightOffer.findUnique({
        where: { id },
        include: { broker: true, listings: { include: { source: true }, orderBy: { rateUsd: "desc" } } },
      });
      if (!offer) throw new HttpError(404, "Load not found.");
      const lane = await laneStats(offer.originCityId, offer.destCityId);
      const borders = borderSummary(offer.originCountry, offer.destCountry);
      return NextResponse.json({
        authenticated: false,
        offer: offerDto(offer),
        broker: offer.broker ? { id: offer.broker.id, name: offer.broker.name, verified: offer.broker.verified, isDemo: offer.broker.isDemo, countryCode: offer.broker.countryCode, taxId: offer.broker.taxId } : null,
        brokerReliability: null,
        lane,
        borders,
        tripTime: tripTime({ km: offer.distanceKm, crew: 1, borderH: typicalBorderHours(offer.originCountry, offer.destCountry) }),
        listings: offer.listings.slice(0, 25).map((l) => listingDto(l, false)),
        listingsTotal: offer.listings.length,
        contacts: [],
        viewer: null,
        favorite: null,
        canAssign: false,
        truckOptions: null,
        selectedTruckId: null,
        match: null,
        backhaul: null,
      });
    }

    const truckParam = req.nextUrl.searchParams.get("truck");
    const d = await getOfferDetail(session.orgId, session.userId, id);
    if (!d) throw new HttpError(404, "Load not found.");
    const { offer, matches, flags } = d;
    const selected = matches.find((x) => x.truck.id === truckParam) ?? matches[0];
    const t = selected?.truck;
    const m = selected?.match;
    // Distances for the profit maths from the truck's road route, when the service answers within a moment.
    const fuel = await fuelTable();
    const fuelByCountry = t?.fuelByCountry !== false;
    const legs = t && m?.eligible ? await legsFor(t, offer, { waitMs: 1200 }) : null;
    const dist = distancesFor(legs?.loaded, legs?.empty, { loadedKm: Math.round(offer.distanceKm), deadheadKm: m?.deadheadKm ?? 0 });
    const borders = borderSummary(offer.originCountry, offer.destCountry);
    const tt = tripTime({ km: offer.distanceKm, drivingMinutes: legs?.loaded?.ok ? legs.loaded.minutes : null, crew: t?.crew ?? 1, borderH: typicalBorderHours(offer.originCountry, offer.destCountry) });

    const [broker, lane, backhaul] = await Promise.all([
      offer.brokerId ? brokerReliability(offer.brokerId, await getI18n()) : null,
      laneStats(offer.originCityId, offer.destCityId),
      t && m?.eligible
        ? findBackhaul(session.orgId, t, offer.destCityId, new Date(Math.max(offer.loadingDate.getTime(), m.readyAt.getTime()) + estimateTransitDays(offer.distanceKm) * DAY), 120, 3)
        : null,
    ]);

    return NextResponse.json({
      authenticated: true,
      offer: { ...offerDto(offer), flags },
      broker: offer.broker ? { id: offer.broker.id, name: offer.broker.name, verified: offer.broker.verified, isDemo: offer.broker.isDemo, countryCode: offer.broker.countryCode, taxId: offer.broker.taxId } : null,
      brokerReliability: broker,
      lane,
      borders,
      tripTime: tt,
      // A load reposted hundreds of times has hundreds of listings: show the best 25 and the real total,
      // and one row per distinct contact.
      listings: offer.listings.slice(0, 25).map((l) => listingDto(l, !l.source.isDemo)),
      listingsTotal: offer.listings.length,
      contacts: uniqueContacts(offer.listings),
      viewer: await senderOf(session.userId, session.orgId),
      favorite: d.favorite,
      canAssign: can(session, "trip:assign") && offer.status === "ACTIVE",
      truckOptions: matches.map((x) => ({ id: x.truck.id, label: `${x.truck.code} — ${x.match.eligible ? `${x.match.score}% · match` : "not eligible"}`, eligible: x.match.eligible })),
      selectedTruckId: t?.id ?? null,
      match: m && t
        ? {
            score: m.score,
            eligible: m.eligible,
            blockers: m.blockers,
            components: m.components,
            reasons: m.reasons,
            warnings: m.warnings,
            deadheadKm: m.deadheadKm,
            benchmarkPerKm: m.benchmarkPerKm,
            truckId: t.id,
            truckCode: t.code,
            truckBody: t.bodyType,
            truckCapacityKg: t.capacityKg,
            truckCity: t.currentCityId,
            truckPos: freshGps(t),
            calc: {
              revenueUsd: Math.round(offer.rateUsd),
              loadedKm: Math.round(dist.loadedKm),
              deadheadKm: Math.round(dist.deadheadKm),
              routed: dist.routed,
              fuelLPer100km: t.fuelLPer100km,
              fuelPriceUsd: fuelByCountry ? effectiveFuelPrice({ truckCountry: getCity(t.currentCityId)?.country, originCountry: offer.originCountry, destCountry: offer.destCountry, deadheadKm: dist.deadheadKm, loadedKm: dist.loadedKm, table: fuel, fallback: t.fuelPriceUsd }) : t.fuelPriceUsd,
              fuelByCountry,
              driverCostPerKm: t.driverCostPerKm,
              maintenancePerKm: t.maintenancePerKm,
              tollsUsd: estimateTollsUsd(dist.loadedKm, offer.originCountry, offer.destCountry, borders.feeUsd),
              otherPerTripUsd: t.otherPerTripUsd,
            },
          }
        : null,
      backhaul,
    });
  } catch (e) {
    return await errorResponse(e);
  }
}

function offerDto(o: {
  id: string; originCityId: string; destCityId: string; originCountry: string; destCountry: string;
  distanceKm: number; loadingDate: Date; unloadingDate: Date | null; bodyType: string; weightKg: number;
  volumeM3: number | null; cargoType: string; requirements: string; packaging: string | null; paymentTerms: string | null;
  rateUsd: number; rate: number; currency: string; status: string; quality: string; isDemo: boolean;
  qualityFlags: string; expiresAt: Date;
  cargoLengthM: number | null; cargoWidthM: number | null; cargoHeightM: number | null; oversize: boolean; adrClass: string | null;
}) {
  return {
    id: o.id,
    originCityId: o.originCityId,
    destCityId: o.destCityId,
    originCountry: o.originCountry,
    destCountry: o.destCountry,
    distanceKm: o.distanceKm,
    loadingDate: o.loadingDate,
    unloadingDate: o.unloadingDate,
    bodyType: o.bodyType,
    weightKg: o.weightKg,
    volumeM3: o.volumeM3,
    cargoType: o.cargoType,
    requirements: parseJson<string[]>(o.requirements, []),
    packaging: o.packaging,
    cargoLengthM: o.cargoLengthM,
    cargoWidthM: o.cargoWidthM,
    cargoHeightM: o.cargoHeightM,
    oversize: o.oversize,
    adrClass: o.adrClass,
    paymentTerms: o.paymentTerms,
    rateUsd: o.rateUsd,
    rate: o.rate,
    currency: o.currency,
    status: o.status,
    quality: o.quality,
    isDemo: o.isDemo,
    qualityFlags: parseJson<string[]>(o.qualityFlags, []),
    expiresAt: o.expiresAt,
  };
}

function listingDto(l: { id: string; sourceId: string; source: { name: string; isDemo: boolean }; sourceUrl: string | null; lastSeenAt: Date; rate: number; currency: string; externalId: string; contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null }, includeContact: boolean) {
  return {
    id: l.id,
    sourceId: l.sourceId,
    sourceName: l.source.name,
    sourceUrl: l.sourceUrl,
    lastSeenAt: l.lastSeenAt,
    rate: l.rate,
    currency: l.currency,
    externalId: l.externalId,
    contactName: includeContact ? (l.contactName ?? null) : null,
    contactPhone: includeContact ? (l.contactPhone ?? null) : null,
    contactEmail: includeContact ? (l.contactEmail ?? null) : null,
  };
}

/** Close a load this organization posted (e.g. it was covered). */
export const DELETE = api<{ id: string }>(
  async ({ session, params, ip }) => {
    const own = await db.freightListing.findFirst({ where: { offerId: params.id, sourceId: PLATFORM_SOURCE.id, externalId: { startsWith: `${session.orgId}-` } } });
    if (!own) throw new HttpError(404, "You can only close loads your company posted.");
    await db.freightOffer.update({ where: { id: params.id }, data: { status: "BOOKED" } });
    invalidateMarketCache();
    await audit({ userId: session.userId, orgId: session.orgId, action: "load.close", entity: "FreightOffer", entityId: params.id, ip });
    return { ok: true };
  },
  { limit: 30 },
);
