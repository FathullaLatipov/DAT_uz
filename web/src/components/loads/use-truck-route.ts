"use client";

import { useEffect, useState } from "react";

export type RouteLegDto =
  | { ok: true; km: number; minutes: number; path: [number, number][]; tollShare: number | null }
  | { ok: false; reason: "NO_ROUTE" | "BAD_KEY" | "LIMIT" | "BUSY" | "FAILED" };

export interface TruckRoute {
  enabled: boolean;
  truckCode?: string;
  hasDimensions?: boolean;
  hazmat?: boolean;
  loaded?: RouteLegDto | null;
  empty?: RouteLegDto | null;
}

// One request per (load, truck) however many components on the page ask for it.
const inflight = new Map<string, Promise<TruckRoute | null>>();

function load(offerId: string, truckId: string): Promise<TruckRoute | null> {
  const key = `${offerId}:${truckId}`;
  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/loads/${encodeURIComponent(offerId)}/route?truck=${encodeURIComponent(truckId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<TruckRoute>) : null))
      .catch(() => null)
      // Answers that were a hiccup (busy, limit) must not stick for the whole visit.
      .then((v) => {
        const transient = [v?.loaded, v?.empty].some((l) => l && !l.ok && l.reason !== "NO_ROUTE");
        if (!v || transient) setTimeout(() => inflight.delete(key), 15_000);
        return v;
      });
    inflight.set(key, p);
  }
  return p;
}

/** The truck-profile road route of a load; undefined while loading, null when it cannot be had. */
export function useTruckRoute(offerId?: string, truckId?: string | null): TruckRoute | null | undefined {
  const [state, setState] = useState<{ key: string; value: TruckRoute | null } | null>(null);
  const key = offerId && truckId ? `${offerId}:${truckId}` : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    load(offerId!, truckId!).then((value) => live && setState({ key, value }));
    return () => { live = false; };
  }, [key, offerId, truckId]);
  if (!key) return null;
  return state?.key === key ? state.value : undefined;
}
