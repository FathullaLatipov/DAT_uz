"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LocateFixed, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { GPS_FRESH_MS } from "@/server/domain/geo";
import { getPosition, type NearMeError } from "../loads/near-me";
import { Badge, Button } from "../ui/primitives";

/**
 * "Use my location for this truck": open the page on the phone in the cab, tap, done. The fix sharpens
 * deadhead distances (see matching) and moves an idle truck to the nearest city.
 */
export function TruckPosition({ truckId, cityId, positionAt, canEdit }: { truckId: string; cityId: string; positionAt: string | null; canEdit: boolean }) {
  const { t, city, ago } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const fresh = !!positionAt && Date.now() - new Date(positionAt).getTime() <= GPS_FRESH_MS;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const p = await getPosition();
      const r = await apiCall<{ cityId: string; snapped: boolean }>(`/api/trucks/${truckId}/position`, "POST", p);
      setMsg({ error: false, text: r.snapped ? t("gps.moved", { city: city(r.cityId) }) : t("gps.saved") });
      router.refresh();
    } catch (e) {
      const code = typeof e === "string" ? (e as NearMeError) : null;
      setMsg({ error: true, text: code && code !== "far" ? t(`toolbar.loc.${code}`) : e instanceof Error ? e.message : t("toolbar.loc.unavailable") });
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      await apiCall(`/api/trucks/${truckId}/position`, "DELETE");
      setMsg(null);
      router.refresh();
    } catch (e) {
      setMsg({ error: true, text: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {positionAt ? (
          <>
            <Badge tone={fresh ? "pos" : "warn"}><LocateFixed className="h-3 w-3" /> {t("gps.fix", { ago: ago(positionAt) })}</Badge>
            <span className="text-xs text-muted">{fresh ? t("gps.used") : t("gps.old")}</span>
          </>
        ) : (
          <span className="text-sm text-muted">{t("gps.none", { city: city(cityId) })}</span>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} {t("gps.set")}
          </Button>
          {positionAt && (
            <button type="button" onClick={clear} disabled={busy} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <X className="h-3 w-3" /> {t("gps.clear")}
            </button>
          )}
        </div>
      )}
      {msg && <p role="status" className={msg.error ? "text-xs text-warn" : "text-xs text-pos"}>{msg.text}</p>}
      {canEdit && !positionAt && <p className="text-xs text-subtle">{t("gps.hint")}</p>}
    </div>
  );
}
