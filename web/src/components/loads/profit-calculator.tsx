"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { computeProfit } from "@/server/services/profitability";
import { useI18n } from "@/i18n/client";
import { cn, pct } from "@/lib/format";
import { Input } from "../ui/primitives";

export interface CalcInput {
  revenueUsd: number;
  loadedKm: number;
  deadheadKm: number;
  fuelLPer100km: number;
  fuelPriceUsd: number;
  driverCostPerKm: number;
  maintenancePerKm: number;
  tollsUsd: number;
  otherPerTripUsd: number;
}

type Unit = "usd" | "km" | "perHundred" | "perLitre" | "perKmCost";
const FIELDS: { k: keyof CalcInput; label: "loadPrice" | "loadedDistance" | "deadhead" | "fuelConsumption" | "fuelPrice" | "driverCost" | "maintenance" | "tolls" | "other"; step: number; unit: Unit }[] = [
  { k: "revenueUsd", label: "loadPrice", step: 10, unit: "usd" },
  { k: "loadedKm", label: "loadedDistance", step: 10, unit: "km" },
  { k: "deadheadKm", label: "deadhead", step: 5, unit: "km" },
  { k: "fuelLPer100km", label: "fuelConsumption", step: 0.5, unit: "perHundred" },
  { k: "fuelPriceUsd", label: "fuelPrice", step: 0.01, unit: "perLitre" },
  { k: "driverCostPerKm", label: "driverCost", step: 0.01, unit: "perKmCost" },
  { k: "maintenancePerKm", label: "maintenance", step: 0.01, unit: "perKmCost" },
  { k: "tollsUsd", label: "tolls", step: 5, unit: "usd" },
  { k: "otherPerTripUsd", label: "other", step: 5, unit: "usd" },
];

/** Deterministic profitability calculator — same function the matching engine uses. */
export function ProfitCalculator({ initial, compact }: { initial: CalcInput; compact?: boolean }) {
  const { t, m, usd } = useI18n();
  const [v, setV] = useState<CalcInput>(initial);
  const [adjust, setAdjust] = useState(false);
  const p = useMemo(() => computeProfit({ ...v, tollsUsd: v.tollsUsd }), [v]);
  const changed = FIELDS.some((f) => v[f.k] !== initial[f.k]);

  const rows: [string, number, boolean?][] = [
    [t("calc.revenue"), p.revenue, true],
    [t("calc.fuel"), -p.fuel],
    [t("calc.driver"), -p.driver],
    [t("calc.maintenance"), -p.maintenance],
    [t("calc.tolls"), -p.tolls],
    [t("calc.otherShort"), -p.other],
  ];

  // Compact (inside the load-board detail panel): the result comes first and the nine inputs fold
  // away behind "Adjust costs", so the column is no taller than its neighbours. The full-page
  // calculator keeps inputs and result side by side, always visible.
  const inputs = (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        {FIELDS.map((f) => (
          <label key={f.k} className="block">
            <span className="mb-1 block text-xs text-muted">{t(`calc.${f.label}`)}</span>
            <span className="relative block">
              <Input
                type="number"
                inputMode="decimal"
                step={f.step}
                min={0}
                value={Number.isFinite(v[f.k]) ? v[f.k] : ""}
                onChange={(e) => setV({ ...v, [f.k]: e.target.value === "" ? 0 : Number(e.target.value) })}
                className={cn("num", compact ? "h-8 pr-14 text-xs" : "pr-16")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">{f.unit === "usd" ? "$" : f.unit === "km" ? m.units.km : m.units[f.unit]}</span>
            </span>
          </label>
        ))}
      </div>
      {changed && (
        <button onClick={() => setV(initial)} className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <RotateCcw className="h-3 w-3" /> {t("calc.reset")}
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("grid gap-5", !compact && "lg:grid-cols-2")}>
      {!compact && inputs}
      <div className={cn("rounded-lg bg-surface-2", compact ? "p-3.5" : "p-4")}>
        <table className="num w-full text-sm">
          <tbody>
            {rows.map(([l, n, bold]) => (
              <tr key={l}>
                <td className={cn("py-1", bold ? "font-medium" : "text-muted")}>{l}</td>
                <td className={cn("py-1 text-right", bold && "font-medium")}>{n < 0 ? `−${usd(-n)}` : usd(n)}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong">
              <td className="pt-2.5 font-semibold">{t("calc.estimatedProfit")}</td>
              <td className={cn("pt-2.5 text-right text-lg font-semibold", p.profit >= 0 ? "text-pos" : "text-neg")}>{usd(p.profit)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <div>
            <div className="text-xs text-muted">{t("calc.profitPerKm")}</div>
            <div className="num text-sm font-semibold">${p.profitPerKm.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("calc.margin")}</div>
            <div className="num text-sm font-semibold">{pct(p.margin, 1)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("calc.emptyKm")}</div>
            <div className="num text-sm font-semibold">{pct(p.emptyPct, 1)}</div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-snug text-subtle">
          {t("calc.disclaimer")}
        </p>
        {compact && (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setAdjust((a) => !a)}
              aria-expanded={adjust}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", adjust && "rotate-180")} />
              {adjust ? t("calc.hide") : changed ? t("calc.adjustEdited") : t("calc.adjust")}
            </button>
            {adjust && <div className="mt-3">{inputs}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
