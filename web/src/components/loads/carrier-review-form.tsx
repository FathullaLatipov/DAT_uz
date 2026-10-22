"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MessageSquarePlus, Star } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Button } from "../ui/primitives";

/** The shipper rates the carrier that delivered a load: stars, "arrived on time", a comment. One review per trip. */
export function CarrierReviewForm({ tripId }: { tripId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [onTime, setOnTime] = useState(true);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiCall(`/api/trips/${tripId}/carrier-review`, "POST", { rating, onTime, comment: comment.trim() || undefined });
      setSent(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (sent) return <p role="status" className="mt-1 text-sm text-pos">{t("crf.sent")}</p>;
  if (!open)
    return (
      <Button type="button" size="sm" variant="outline" className="mt-1.5" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="h-4 w-4" /> {t("crf.open")}
      </Button>
    );
  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <div className="text-sm font-medium">{t("crf.title")}</div>
        <div className="text-xs text-muted">{t("crf.hint")}</div>
      </div>
      <div role="radiogroup" aria-label={t("crf.rating")} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} / 5`} onClick={() => setRating(n)} className="rounded p-0.5">
            <Star className={cn("h-7 w-7 transition-colors", n <= rating ? "fill-warn text-warn" : "text-border hover:text-muted")} />
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onTime} onChange={(e) => setOnTime(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> {t("crf.onTime")}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">{t("crf.comment")}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]" />
      </label>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t("crf.submit")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("crf.cancel")}</Button>
      </div>
    </form>
  );
}
