"use client";

import { useEffect, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { CITIES, haversineKm } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";

/** Past this distance the nearest hub is not "near" the user, so we say so instead of guessing. */
export const NEAR_MAX_KM = 300;
/** Search radius applied around the detected city when none was chosen. */
export const NEAR_DEFAULT_RADIUS = 100;

export type NearMeResult = { cityId: string; distanceKm: number };
export type NearMeError = "unsupported" | "denied" | "unavailable" | "timeout" | "far";

export function nearestCity(lat: number, lng: number): NearMeResult {
  let best: NearMeResult = { cityId: CITIES[0].id, distanceKm: Infinity };
  for (const c of CITIES) {
    const d = haversineKm({ lat, lng }, c);
    if (d < best.distanceKm) best = { cityId: c.id, distanceKm: d };
  }
  return best;
}

/**
 * Asks the browser for the position once (the browser shows its own permission prompt) and maps it
 * to the nearest city we model. Coordinates never leave the device — only the city id is used in the
 * search URL. Geolocation needs HTTPS (localhost is exempt), which production has.
 */
export function locateNearestCity(): Promise<NearMeResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject("unsupported" satisfies NearMeError);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const r = nearestCity(pos.coords.latitude, pos.coords.longitude);
        if (r.distanceKm > NEAR_MAX_KM) reject("far" satisfies NearMeError);
        else resolve(r);
      },
      (err) => reject((err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable") satisfies NearMeError),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

export type NearMeStatus = { kind: "busy" } | { kind: "ok"; cityId: string; distanceKm: number } | { kind: "error"; error: NearMeError } | null;

/** Message line shown under the search bar. */
export function NearMeNote({ status }: { status: NearMeStatus }) {
  const { t, city, km } = useI18n();
  if (!status) return null;
  const text =
    status.kind === "busy" ? t("toolbar.locating")
    : status.kind === "ok" ? t("toolbar.nearCity", { city: city(status.cityId), dist: km(Math.round(status.distanceKm)) })
    : status.error === "far" ? t("toolbar.locFar", { n: NEAR_MAX_KM })
    : t(`toolbar.loc.${status.error}`);
  return (
    <p role="status" className={cn("mt-2 text-xs", status.kind === "error" ? "text-warn" : "text-muted")}>
      {text}
    </p>
  );
}

export function NearMeButton({
  onFound, onStatus, status, className, withLabel,
}: {
  onFound: (r: NearMeResult) => void;
  onStatus: (s: NearMeStatus) => void;
  status: NearMeStatus;
  className?: string;
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  const busy = status?.kind === "busy";
  // The note clears itself so a stale "denied" doesn't linger forever.
  useEffect(() => {
    if (status?.kind !== "error") return;
    const id = setTimeout(() => onStatus(null), 8000);
    return () => clearTimeout(id);
  }, [status, onStatus]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Hide on browsers without geolocation (checked after mount to keep SSR and hydration identical).
  if (mounted && typeof navigator !== "undefined" && !navigator.geolocation) return null;

  async function go() {
    onStatus({ kind: "busy" });
    try {
      const r = await locateNearestCity();
      onStatus({ kind: "ok", ...r });
      onFound(r);
    } catch (e) {
      onStatus({ kind: "error", error: (typeof e === "string" ? e : "unavailable") as NearMeError });
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      title={t("toolbar.nearMeTitle")}
      aria-label={t("toolbar.nearMe")}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface text-sm text-muted transition-colors hover:bg-surface-2 hover:text-brand disabled:opacity-60",
        withLabel ? "h-9 px-3" : "h-9 w-9",
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
      {withLabel && t("toolbar.nearMe")}
    </button>
  );
}
