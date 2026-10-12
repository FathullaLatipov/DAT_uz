import { db } from "../db";

const DAY = 86_400_000;

export interface TripStats {
  trips: number;
  revenue: number;
  cost: number;
  profit: number;
  loadedKm: number;
  emptyKm: number;
  utilization: number | null; // loaded / total km
  ratePerKm: number | null;
  profitPerKm: number | null;
  isDemo: boolean;
}

export function tripStats(trips: { revenueUsd: number; costUsd: number; loadedKm: number; emptyKm: number; isDemo: boolean }[]): TripStats {
  const revenue = trips.reduce((s, t) => s + t.revenueUsd, 0);
  const cost = trips.reduce((s, t) => s + t.costUsd, 0);
  const loadedKm = trips.reduce((s, t) => s + t.loadedKm, 0);
  const emptyKm = trips.reduce((s, t) => s + t.emptyKm, 0);
  const total = loadedKm + emptyKm;
  return {
    trips: trips.length,
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    profit: Math.round(revenue - cost),
    loadedKm: Math.round(loadedKm),
    emptyKm: Math.round(emptyKm),
    utilization: total > 0 ? loadedKm / total : null,
    ratePerKm: loadedKm > 0 ? revenue / loadedKm : null,
    profitPerKm: total > 0 ? (revenue - cost) / total : null,
    isDemo: trips.some((t) => t.isDemo),
  };
}

export async function fleetSummary(orgId: string) {
  const [trucks, trips, recs] = await Promise.all([
    db.truck.groupBy({ by: ["status"], where: { orgId }, _count: true }),
    db.trip.findMany({ where: { orgId, status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    db.recommendation.groupBy({ by: ["action"], where: { orgId, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: true }),
  ]);
  const byStatus = Object.fromEntries(trucks.map((t) => [t.status, t._count])) as Record<string, number>;
  const total = trucks.reduce((s, t) => s + t._count, 0);
  const shown = recs.find((r) => r.action === "SHOWN")?._count ?? 0;
  const accepted = recs.find((r) => r.action === "ACCEPTED")?._count ?? 0;
  return {
    total,
    available: byStatus.AVAILABLE ?? 0,
    onRoute: (byStatus.IN_TRANSIT ?? 0) + (byStatus.LOADING ?? 0) + (byStatus.UNLOADING ?? 0),
    maintenance: byStatus.MAINTENANCE ?? 0,
    offline: byStatus.OFFLINE ?? 0,
    stats30d: tripStats(trips),
    acceptance: { shown, accepted, rate: shown + accepted > 0 ? accepted / Math.max(shown, accepted) : null },
  };
}

export async function truckDetail(orgId: string, truckId: string) {
  const truck = await db.truck.findFirst({
    where: { id: truckId, orgId }, // org isolation
    include: {
      currentCity: true,
      driver: true,
      trips: { orderBy: { startedAt: "desc" }, take: 40, include: { originCity: true, destCity: true } },
    },
  });
  if (!truck) return null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const completed = truck.trips.filter((t) => t.status === "COMPLETED");
  const month = tripStats(completed.filter((t) => (t.completedAt ?? t.startedAt) >= monthStart));
  const last60 = tripStats(completed.filter((t) => (t.completedAt ?? t.startedAt).getTime() >= Date.now() - 60 * DAY));

  // Weekly series for charts (last 8 weeks).
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.now() - (7 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const w = completed.filter((t) => {
      const at = (t.completedAt ?? t.startedAt).getTime();
      return at > start && at <= end;
    });
    const s = tripStats(w);
    return { week: new Date(end).toISOString().slice(5, 10), revenue: s.revenue, profit: s.profit, loadedKm: s.loadedKm, emptyKm: s.emptyKm };
  });
  return { truck, month, last60, weeks, activeTrip: truck.trips.find((t) => t.status === "IN_TRANSIT" || t.status === "PLANNED") ?? null };
}
