"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Banknote, Clock, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { paymentVerdict, type PaymentVerdict } from "@/server/services/payment-rules";
import { useDialog } from "../ui/dialog";
import { Badge, Button } from "../ui/primitives";

export interface PaymentInfo {
  tripId: string;
  status: string; // UNPAID | SHIPPER_PAID | CONFIRMED | DISPUTED
  tripStatus: string;
  amountUsd: number;
  dueAt: string | null;
  paidAt: string | null;
}

const TONE: Record<string, "neutral" | "info" | "pos" | "neg"> = { UNPAID: "neutral", SHIPPER_PAID: "info", CONFIRMED: "pos", DISPUTED: "neg" };

/**
 * Payment for a trip, for whichever side is looking: the shipper says it was sent, the carrier confirms it
 * arrived (or reports that it did not). The due date comes from the load's payment terms.
 */
export function PaymentBox({ p, role, compact }: { p: PaymentInfo; role: "carrier" | "shipper"; compact?: boolean }) {
  const { t, shortDate, usd } = useI18n();
  const dialog = useDialog();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const due = p.dueAt ? new Date(p.dueAt) : null;
  const verdict: PaymentVerdict = paymentVerdict({ status: p.status, paidAt: p.paidAt ? new Date(p.paidAt) : null }, due);
  const delivered = p.tripStatus === "COMPLETED";

  async function act(action: "paid" | "received" | "dispute") {
    let note: string | undefined;
    if (action === "dispute") {
      const answer = await dialog.prompt({ title: t("pay.disputeConfirmTitle"), message: t("pay.disputeConfirmBody"), label: t("pay.note"), defaultValue: "", confirmText: t("pay.notPaid"), maxLength: 300, allowEmpty: true });
      if (answer === null) return;
      note = answer;
    } else {
      const ok = await dialog.confirm({
        title: t(action === "paid" ? "pay.paidConfirmTitle" : "pay.receivedConfirmTitle"),
        message: t(action === "paid" ? "pay.paidConfirmBody" : "pay.receivedConfirmBody"),
        confirmText: t(action === "paid" ? "pay.iPaid" : "pay.received"),
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      await apiCall(`/api/trips/${p.tripId}/payment`, "POST", { action, note: note || undefined });
      router.refresh();
    } catch (e) {
      await dialog.alert({ message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const canPaid = role === "shipper" && (p.status === "UNPAID" || p.status === "DISPUTED");
  const canReceive = role === "carrier" && p.status !== "CONFIRMED";
  const canDispute = role === "carrier" && delivered && (p.status === "UNPAID" || p.status === "SHIPPER_PAID");

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2 text-xs" : "flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"}>
      <Badge tone={TONE[p.status] ?? "neutral"}>
        {p.status === "CONFIRMED" ? <BadgeCheck className="h-3 w-3" /> : p.status === "DISPUTED" ? <AlertTriangle className="h-3 w-3" /> : p.status === "SHIPPER_PAID" ? <Banknote className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {t(`pay.status.${p.status as "UNPAID" | "SHIPPER_PAID" | "CONFIRMED" | "DISPUTED"}`)}
      </Badge>
      {!compact && <span className="num font-medium">{usd(p.amountUsd)}</span>}
      {verdict === "on-time" && <span className="text-pos">{t("pay.onTime")}</span>}
      {verdict === "late" && <span className="text-warn">{t("pay.late")}</span>}
      {verdict === "overdue" && due && <span className="font-medium text-neg">{t("pay.overdue", { date: shortDate(due) })}</span>}
      {(verdict === "open" || verdict === "waiting") && due && p.status !== "CONFIRMED" && <span className="text-muted">{t("pay.due", { date: shortDate(due) })}</span>}
      {canPaid && (
        <Button size="sm" onClick={() => act("paid")} disabled={busy !== null}>
          {busy === "paid" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("pay.iPaid")}
        </Button>
      )}
      {canReceive && (
        <Button size="sm" onClick={() => act("received")} disabled={busy !== null}>
          {busy === "received" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("pay.received")}
        </Button>
      )}
      {canDispute && (
        <Button size="sm" variant="outline" onClick={() => act("dispute")} disabled={busy !== null}>
          {busy === "dispute" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("pay.notPaid")}
        </Button>
      )}
    </div>
  );
}
