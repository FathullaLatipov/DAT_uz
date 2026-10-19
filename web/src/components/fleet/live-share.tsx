"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Radio, Square } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { Button } from "../ui/primitives";

const SEND_EVERY_MS = 30_000;
const KEY = (tripId: string) => `karvon.share.${tripId}`;

/**
 * The phone in the cab reports where the truck is while this page is open: the browser's position watch, one
 * report about every 30 s, and a screen wake lock so the phone does not sleep and stop reporting. It resumes
 * after a reload. (A browser page cannot track in the background; for that the driver would use the Telegram
 * "live location" — a follow-up.)
 */
export function LiveShare({ tripId }: { tripId: string }) {
  const { t, ago } = useI18n();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const sentAt = useRef(0);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    lock.current?.release().catch(() => {});
    lock.current = null;
    try { sessionStorage.removeItem(KEY(tripId)); } catch {}
    setOn(false);
  }, [tripId]);

  const start = useCallback(() => {
    if (!navigator.geolocation) return setError(t("toolbar.loc.unsupported"));
    setBusy(true);
    setError(null);
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setBusy(false);
        setOn(true);
        try { sessionStorage.setItem(KEY(tripId), "1"); } catch {}
        if (Date.now() - sentAt.current < SEND_EVERY_MS) return;
        sentAt.current = Date.now();
        try {
          await apiCall(`/api/trips/${tripId}/position`, "POST", { lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : undefined });
          setLastSent(new Date());
          setError(null);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      (err) => {
        setBusy(false);
        setOn(false);
        setError(t(`toolbar.loc.${err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable"}`));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    navigator.wakeLock?.request("screen").then((l) => (lock.current = l)).catch(() => {});
  }, [tripId, t]);

  // Resume after a reload, and take the wake lock back when the tab becomes visible again.
  useEffect(() => {
    let resumed = false;
    try { resumed = sessionStorage.getItem(KEY(tripId)) === "1"; } catch {}
    if (resumed) start();
    const onVisible = () => {
      if (document.visibilityState === "visible" && watch.current != null && !lock.current) navigator.wakeLock?.request("screen").then((l) => (lock.current = l)).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      lock.current?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {on ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium text-pos"><Radio className="h-4 w-4 animate-pulse" /> {t("tt.sharing")}</span>
            {lastSent && <span className="text-xs text-muted">{t("tt.lastSent", { ago: ago(lastSent) })}</span>}
            <Button size="sm" variant="outline" onClick={stop}><Square className="h-3.5 w-3.5" /> {t("tt.stop")}</Button>
          </>
        ) : (
          <Button size="sm" onClick={start} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} {t("tt.share")}</Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">{t("tt.shareHint")}</p>
      {error && <p role="alert" className="mt-1.5 text-xs text-warn">{error}</p>}
    </div>
  );
}
