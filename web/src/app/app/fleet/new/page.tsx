import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { DEFAULT_COST_PROFILE } from "@/server/services/profitability";
import { Card, PageHeader } from "@/components/ui/primitives";
import { TruckForm } from "@/components/fleet/truck-form";

export const metadata: Metadata = { title: "Add truck" };

export default async function NewTruck() {
  const s = await requireSession();
  if (!can(s, "truck:write")) redirect("/app/fleet");
  const n = await db.truck.count({ where: { orgId: s.orgId } });
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add truck" subtitle="Only the vehicle and its location are required." />
      <Card className="p-4 sm:p-6">
        <TruckForm
          initial={{
            code: `T-${1001 + n}`, plate: "", truckType: "SEMI", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent",
            status: "AVAILABLE", availableFrom: new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 16), driverName: "", ...DEFAULT_COST_PROFILE,
          }}
        />
      </Card>
    </div>
  );
}
