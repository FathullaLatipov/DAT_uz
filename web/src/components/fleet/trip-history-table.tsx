"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Star } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Badge, Button } from "../ui/primitives";

export interface TripRow {
  id: string;
  startedAt: string | Date;
  originCity: { id: string };
  destCity: { id: string };
  revenueUsd: number;
  costUsd: number;
  emptyKm: number;
  status: string;
  isDemo: boolean;
  review: { id: string } | null;
  offer: { brokerId: string | null; broker: { name: string } | null } | null;
}

/** Trip history with an inline "leave a review" form for completed trips that have an
 * identified broker and haven't been reviewed yet — one review per trip, enforced server-side
 * by the unique BrokerReview.tripId constraint. */
export function TripHistoryTable({ trips }: { trips: TripRow[] }) {
  const { t, label, city, shortDate, usd } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-y border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 font-medium">{t("fleet.colDate")}</th>
            <th className="px-3 py-2 font-medium">{t("table.route")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("calc.revenue")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("chart.profit")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("dash.emptyKm")}</th>
            <th className="px-3 py-2 font-medium">{t("fleet.colStatus")}</th>
          </tr>
        </thead>
        <tbody className="num divide-y divide-border">
          {trips.slice(0, 15).map((tr) => {
            const reviewable = tr.status === "COMPLETED" && !!tr.offer?.brokerId && !tr.review;
            const open = openId === tr.id;
            return (
              <Fragment key={tr.id}>
                <tr>
                  <td className="whitespace-nowrap px-4 py-2">{shortDate(tr.startedAt)}</td>
                  <td className="px-3 py-2">{city(tr.originCity.id)} → {city(tr.destCity.id)}</td>
                  <td className="px-3 py-2 text-right">{usd(tr.revenueUsd)}</td>
                  <td className={cn("px-3 py-2 text-right", tr.revenueUsd - tr.costUsd >= 0 ? "text-pos" : "text-neg")}>{usd(tr.revenueUsd - tr.costUsd)}</td>
                  <td className="px-3 py-2 text-right">{Math.round(tr.emptyKm)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={tr.status === "COMPLETED" ? "neutral" : "info"}>{label(tr.status).toLowerCase()}</Badge>
                      {tr.isDemo && <span className="text-xs text-accent">{t("fleet.demo")}</span>}
                      {reviewable && (
                        <button type="button" onClick={() => setOpenId(open ? null : tr.id)} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                          <MessageSquarePlus className="h-3 w-3" /> {t("fleet.review")}
                        </button>
                      )}
                      {tr.status === "COMPLETED" && tr.review && <span className="text-xs text-muted">{t("fleet.reviewed")}</span>}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={6} className="bg-surface-2/40 p-0">
                      <ReviewForm tripId={tr.id} brokerName={tr.offer?.broker?.name ?? t("fleet.thisBroker")} onDone={() => setOpenId(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewForm({ tripId, brokerName, onDone }: { tripId: string; brokerName: string; onDone: () => void }) {
  const { t, tn } = useI18n();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [paidOnTime, setPaidOnTime] = useState<boolean | null>(null);
  const [disputed, setDisputed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await apiCall(`/api/trips/${tripId}/review`, "POST", { rating, paidOnTime, disputed, cancelled, comment: comment.trim() || undefined });
      router.refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <p className="text-sm font-medium">{t("fleet.reviewTitle", { broker: brokerName })}</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={t("panel.rating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-pressed={rating === n} aria-label={tn("fleet.stars", n)}>
            <Star className={cn("h-5 w-5", n <= rating ? "fill-current text-accent" : "text-subtle")} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={paidOnTime === true} onChange={(e) => setPaidOnTime(e.target.checked ? true : null)} className="h-4 w-4 accent-[var(--brand)]" />
          {t("detail.paidOnTime")}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={disputed} onChange={(e) => setDisputed(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          {t("fleet.dispute")}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          {t("fleet.cancelled")}
        </label>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder={t("fleet.commentPlaceholder")}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
      />
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} size="sm">{pending ? t("fleet.submitting") : t("fleet.submit")}</Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>{t("fleet.cancel")}</Button>
      </div>
    </div>
  );
}
