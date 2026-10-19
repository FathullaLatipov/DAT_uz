"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { useDialog } from "../ui/dialog";
import { Button } from "../ui/primitives";

/** The carrier hands a taken load back before the trip starts: the load returns to the board, the shipper is told. */
export function CancelTripButton({ tripId }: { tripId: string }) {
  const { t } = useI18n();
  const dialog = useDialog();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function cancel() {
    const yes = await dialog.confirm({ title: t("fleet.cancelTitle"), message: t("fleet.cancelBody"), danger: true, confirmText: t("fleet.cancelTrip"), cancelText: t("fleet.keepTrip") });
    if (!yes) return;
    setPending(true);
    try {
      await apiCall(`/api/trips/${tripId}/cancel`, "POST");
      router.refresh();
    } catch (e) {
      await dialog.alert({ message: (e as Error).message });
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} {t("fleet.cancelTrip")}
    </Button>
  );
}
