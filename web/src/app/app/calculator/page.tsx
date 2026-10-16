import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { DEFAULT_COST_PROFILE, estimateTollsUsd } from "@/server/services/profitability";
import { Card, PageHeader } from "@/components/ui/primitives";
import { ProfitCalculator } from "@/components/loads/profit-calculator";
import { TruckPicker } from "@/components/fleet/truck-picker";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("cp.title") };
}

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ truck?: string }> }) {
  const s = await requireSession();
  const { t: tr } = await getI18n();
  const { truck } = await searchParams;
  const trucks = await db.truck.findMany({ where: { orgId: s.orgId }, orderBy: { code: "asc" } });
  const t = trucks.find((x) => x.id === truck) ?? trucks[0];
  const profile = t ?? DEFAULT_COST_PROFILE;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={tr("cp.title")}
        subtitle={tr("cp.subtitle")}
        actions={trucks.length > 0 && <TruckPicker trucks={trucks.map((x) => ({ id: x.id, code: x.code }))} value={t?.id} />}
      />
      <Card className="p-4 sm:p-6">
        <ProfitCalculator
          key={t?.id ?? "default"}
          initial={{
            revenueUsd: 1280, loadedKm: 790, deadheadKm: 35,
            fuelLPer100km: profile.fuelLPer100km, fuelPriceUsd: profile.fuelPriceUsd, driverCostPerKm: profile.driverCostPerKm,
            maintenancePerKm: profile.maintenancePerKm, otherPerTripUsd: profile.otherPerTripUsd,
            tollsUsd: estimateTollsUsd(790, "UZ", "KZ"),
          }}
        />
      </Card>
    </div>
  );
}
