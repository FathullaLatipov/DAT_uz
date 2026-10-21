"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { apiCall } from "@/lib/client";
import { Button, Input } from "../ui/primitives";

export interface FuelRow { country: string; priceUsd: number; updatedAt: string | null }

/** Admin card: diesel price per country, one row each, saved one at a time. */
export function FuelPrices({ rows }: { rows: FuelRow[] }) {
  const { t, country, shortDate } = useI18n();
  const [state, setState] = useState(() => Object.fromEntries(rows.map((r) => [r.country, { value: String(r.priceUsd), updatedAt: r.updatedAt, busy: false, ok: false, error: "" }])));
  const patch = (c: string, p: Partial<(typeof state)[string]>) => setState((s) => ({ ...s, [c]: { ...s[c], ...p } }));

  async function save(c: string) {
    patch(c, { busy: true, ok: false, error: "" });
    try {
      const r = await apiCall<{ updatedAt: string }>("/api/admin/fuel", "PATCH", { country: c, priceUsd: Number(state[c].value.replace(",", ".")) });
      patch(c, { busy: false, ok: true, updatedAt: r.updatedAt });
    } catch (e) {
      patch(c, { busy: false, error: (e as Error).message });
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="pb-1.5 font-medium">{t("fuel.country")}</th>
          <th className="pb-1.5 font-medium">{t("fuel.price")}</th>
          <th className="pb-1.5 font-medium">{t("fuel.updated")}</th>
          <th />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => {
          const s = state[r.country];
          return (
            <tr key={r.country}>
              <td className="py-1.5 pr-3">{country(r.country)}</td>
              <td className="py-1.5 pr-3"><Input className="h-8 w-24" type="number" inputMode="decimal" step="0.01" min={0.05} max={5} value={s.value} onChange={(e) => patch(r.country, { value: e.target.value, ok: false })} aria-label={`${country(r.country)} ${t("fuel.price")}`} /></td>
              <td className="num py-1.5 pr-3 text-xs text-muted">{s.updatedAt ? shortDate(s.updatedAt) : "—"}</td>
              <td className="py-1.5 text-right">
                <Button size="sm" variant="outline" onClick={() => save(r.country)} disabled={s.busy}>
                  {s.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{s.ok ? t("fuel.saved") : t("fuel.save")}
                </Button>
                {s.error && <div className="text-xs text-neg">{s.error}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
