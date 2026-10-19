"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { useDialog } from "../ui/dialog";
import { Button } from "../ui/primitives";
import { CancelTripButton } from "./cancel-trip-button";

/**
 * What the carrier can do with the truck's current trip: a planned trip can be started or cancelled; a trip on
 * the road can be completed (the truck is then free in the destination city and the carrier is taken to the
 * review form for the shipper).
 */
export function TripActions({ tripId, truckId, status, destCityId }: { tripId: string; truckId: string; status: string; destCityId: string }) {
  const { t, city } = useI18n();
  const dialog = useDialog();
  const router = useRouter();
  const [busy, setBusy] = useState<"start" | "complete" | null>(null);

  async function start() {
    setBusy("start");
    try {
      await apiCall(`/api/trips/${tripId}/start`, "POST");
      router.refresh();
    } catch (e) {
      await dialog.alert({ message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
  async function complete() {
    const yes = await dialog.confirm({ title: t("fleet.completeTitle"), message: t("fleet.completeBody", { city: city(destCityId) }), confirmText: t("fleet.completeTrip") });
    if (!yes) return;
    setBusy("complete");
    try {
      await apiCall(`/api/trips/${tripId}/complete`, "POST");
      router.push(`/app/fleet/${truckId}?delivered=${tripId}`);
      router.refresh();
    } catch (e) {
      await dialog.alert({ message: (e as Error).message });
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 self-end">
      {status === "PLANNED" && (
        <Button size="sm" onClick={start} disabled={busy !== null}>
          {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {t("fleet.startTrip")}
        </Button>
      )}
      <Button size="sm" variant={status === "IN_TRANSIT" ? "primary" : "outline"} onClick={complete} disabled={busy !== null}>
        {busy === "complete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {t("fleet.completeTrip")}
      </Button>
      {status === "PLANNED" && <CancelTripButton tripId={tripId} />}
    </div>
  );
}
