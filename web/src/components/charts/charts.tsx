"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/client";

/**
 * Chart conventions: one y-axis, thin marks, recessive grid, tooltip on hover, text in ink
 * tokens (never series colour). Series colours come from theme tokens so dark mode is
 * its own validated pair (brand vs neutral "empty").
 */

const axis = { stroke: "var(--subtle)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />;

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-3 font-medium text-fg">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}


export function ProfitBars({ data }: { data: { week: string; profit: number }[] }) {
  const { t, usd } = useI18n();
  return (
    <div className="h-48" role="img" aria-label={t("chart.weeklyProfit")}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="week" {...axis} />
          <YAxis {...axis} width={48} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip fmt={usd} />} />
          <Bar dataKey="profit" name={t("chart.profit")} fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KmStack({ data }: { data: { week: string; loadedKm: number; emptyKm: number }[] }) {
  const { t, km: kmFmt } = useI18n();
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand" />{t("chart.loadedKm")}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-subtle" />{t("chart.emptyKm")}</span>
      </div>
      <div className="h-44" role="img" aria-label={t("chart.loadedVsEmpty")}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            {grid}
            <XAxis dataKey="week" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip fmt={kmFmt} />} />
            <Bar dataKey="loadedKm" name={t("chart.loaded")} stackId="km" fill="var(--brand)" maxBarSize={28} stroke="var(--surface)" strokeWidth={2} />
            <Bar dataKey="emptyKm" name={t("chart.empty")} stackId="km" fill="var(--subtle)" radius={[4, 4, 0, 0]} maxBarSize={28} stroke="var(--surface)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RateTrend({ data, height = 160 }: { data: { date: string; perKm: number | null; loads: number }[]; height?: number }) {
  const { t, perKm } = useI18n();
  return (
    <div style={{ height }} role="img" aria-label={t("chart.rateByWeek")}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis {...axis} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
          <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<Tip fmt={perKm} />} />
          <Area type="monotone" dataKey="perKm" name={t("chart.medianKm")} stroke="var(--brand)" strokeWidth={2} fill="url(#rateFill)" connectNulls dot={{ r: 3, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
