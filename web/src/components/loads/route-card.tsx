"use client";

import Link from "next/link";
import { AlertTriangle, Loader2, Route as RouteIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { useTruckRoute, type RouteLegDto } from "./use-truck-route";

/** Distance and driving time of the road planned for this truck, with what it was planned for and how far to trust it. */
export function RouteCard({ offerId, truckId, truckCode }: { offerId: string; truckId: string; truckCode: string }) {
  const { t, km } = useI18n();
  const r = useTruckRoute(offerId, truckId);
  if (r === null || (r && !r.enabled)) return null; // routing is not set up on this server (or the request failed): say nothing
  const dur = (min: number) => (min >= 60 ? t("rt.duration", { h: Math.floor(min / 60), m: min % 60 }) : t("rt.minutes", { m: min }));
  const failure = (l: RouteLegDto & { ok: false }) =>
    l.reason === "NO_ROUTE" ? t("rt.noRoute") : l.reason === "BAD_KEY" ? t("rt.notSetUp") : t("rt.busy");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <RouteIcon className="h-4 w-4 text-brand" /> {t("rt.title", { code: truckCode })}
      </div>
      {r === undefined ? (
        <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("rt.loading")}</p>
      ) : (
        <>
          {[
            { key: "empty", label: t("rt.toPickup"), leg: r.empty },
            { key: "loaded", label: t("rt.loaded"), leg: r.loaded },
          ].map(({ key, label, leg }) =>
            leg ? (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <span className="text-muted">{label}</span>
                {leg.ok ? <span className="num font-medium">{km(leg.km)} · {dur(leg.minutes)}</span> : <span className="text-xs text-warn">{failure(leg)}</span>}
              </div>
            ) : null,
          )}
          {r.loaded?.ok && r.loaded.tollShare != null && r.loaded.tollShare > 0 && (
            <p className="text-xs text-muted">{t("rt.tolls", { pct: Math.round(r.loaded.tollShare * 100) })}</p>
          )}
          {r.hazmat && <p className="text-xs text-muted">{t("rt.hazmat")}</p>}
          {r.hasDimensions === false && (
            <p className="flex gap-1.5 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{t("rt.noDims")} <Link href={`/app/fleet/${truckId}`} className="underline">{t("pass.missing")}</Link></span>
            </p>
          )}
          <p className="text-xs text-subtle">{t("rt.note")}</p>
        </>
      )}
    </div>
  );
}
