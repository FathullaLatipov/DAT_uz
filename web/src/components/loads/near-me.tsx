"use client";

import { useEffect, useState } from "react";
import { LocateFixed, Loader2, X } from "lucide-react";
import { CITIES, nearestCityTo } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";

/** Past this distance the nearest hub is not "near" the user, so we say so instead of guessing. */
export const NEAR_MAX_KM = 300;
/** Search radius applied around the detected city when none was chosen. */
export const NEAR_DEFAULT_RADIUS = 100;

export type NearMeResult = { cityId: string; distanceKm: number; lat?: number; lng?: number; at?: number };
export type NearMeError = "unsupported" | "denied" | "unavailable" | "timeout" | "far";

export function nearestCity(lat: number, lng: number): NearMeResult {
  const n = nearestCityTo(lat, lng);
  return { cityId: n.city.id, distanceKm: n.distanceKm };
}

export type Position = { lat: number; lng: number };

/** One-shot browser position (the browser shows its own permission prompt). Rejects with a NearMeError code. */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject("unsupported" satisfies NearMeError);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject((err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable") satisfies NearMeError),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

/**
 * Maps the position to the nearest city we model. Coordinates never leave the device here — only the
 * city id is used in the search URL. Geolocation needs HTTPS (localhost is exempt), which production has.
 */
export async function locateNearestCity(): Promise<NearMeResult> {
  const p = await getPosition();
  const r = nearestCity(p.lat, p.lng);
  if (r.distanceKm > NEAR_MAX_KM) throw "far" satisfies NearMeError;
  return { ...r, ...p, at: Date.now() };
}

/** The viewer's own position, remembered in this browser for 24 h so maps can mark "you" without asking again. */
export function useSavedPosition(): Position | null {
  const [pos, setPos] = useState<Position | null>(null);
  useEffect(() => {
    const s = loadLocation();
    if (s?.lat != null && s.lng != null && s.at && Date.now() - s.at < 24 * 3_600_000) setPos({ lat: s.lat, lng: s.lng });
  }, []);
  return pos;
}

export type NearMeStatus = { kind: "busy" } | { kind: "ok"; cityId: string; distanceKm: number } | { kind: "error"; error: NearMeError } | null;

const STORE = "karvon.loc";
export const saveLocation = (r: NearMeResult | null) => {
  try {
    if (r) localStorage.setItem(STORE, JSON.stringify(r));
    else localStorage.removeItem(STORE);
  } catch {}
};
export function loadLocation(): NearMeResult | null {
  try {
    const r = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return r && typeof r.cityId === "string" && CITIES.some((c) => c.id === r.cityId)
      ? { cityId: r.cityId, distanceKm: Number(r.distanceKm) || 0, lat: typeof r.lat === "number" ? r.lat : undefined, lng: typeof r.lng === "number" ? r.lng : undefined, at: typeof r.at === "number" ? r.at : undefined }
      : null;
  } catch {
    return null;
  }
}

/**
 * Line under the search bar. Errors and "locating…" are transient; once a location is found it stays
 * as a chip ("Your location: Tashkent · within 100 km") for as long as the origin is that city.
 */
export function NearMeNote({ status, originId, radiusKm, onClear }: { status: NearMeStatus; originId: string; radiusKm: string; onClear: () => void }) {
  const { t, city } = useI18n();
  if (!status) return null;
  if (status.kind === "ok") {
    if (status.cityId !== originId) return null;
    return (
      <p role="status" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand">
        <LocateFixed className="h-3.5 w-3.5" />
        {t("toolbar.nearCity", { city: city(status.cityId) })}
        {radiusKm && <span className="font-normal text-muted">· {t("toolbar.withinOrigin", { n: radiusKm })}</span>}
        <button type="button" onClick={onClear} title={t("toolbar.clearLocation")} aria-label={t("toolbar.clearLocation")} className="rounded-full p-0.5 hover:bg-brand/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </p>
    );
  }
  const text = status.kind === "busy" ? t("toolbar.locating") : status.error === "far" ? t("toolbar.locFar", { n: NEAR_MAX_KM }) : t(`toolbar.loc.${status.error}`);
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
      saveLocation(r);
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
