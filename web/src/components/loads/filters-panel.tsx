"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS, label } from "@/server/domain/enums";
import { Button, Field, Input, Select } from "../ui/primitives";
import { cn } from "@/lib/format";

type Opt = { id: string; name: string };

const KEYS = [
  "origin", "radiusKm", "dest", "destCountry", "originCountry", "loadingFrom", "loadingTo", "cargo", "body", "weightMin", "weightMax", "volumeMin",
  "rateMin", "ratePerKmMin", "currency", "payment", "source", "verifiedOnly", "minScore", "maxDeadhead", "truckId", "brokerId", "distanceMin", "distanceMax",
];

export function FiltersPanel({ trucks, sources }: { trucks: Opt[]; sources: Opt[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])));
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const multi = (k: string) => (v[k] ? v[k].split(",") : []);
  const toggleMulti = (k: string, item: string) => {
    const cur = multi(k);
    set(k, (cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]).join(","));
  };
  const activeCount = KEYS.filter((k) => sp.get(k)).length;

  function apply() {
    const p = new URLSearchParams();
    for (const k of ["sort", "view"]) if (sp.get(k)) p.set(k, sp.get(k)!);
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, val);
    router.push(`${path}?${p.toString()}`);
    setOpen(false);
  }
  function reset() {
    setV(Object.fromEntries(KEYS.map((k) => [k, ""])));
    const p = new URLSearchParams();
    if (sp.get("view")) p.set("view", sp.get("view")!);
    router.push(`${path}?${p.toString()}`);
    setOpen(false);
  }

  const body = (
    <div className="space-y-4">
      <Field label="Score for truck">
        <Select value={v.truckId} onChange={(e) => set("truckId", e.target.value)}>
          <option value="">Best truck in my fleet</option>
          {trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label="Origin">
          <Select value={v.origin} onChange={(e) => set("origin", e.target.value)}>
            <option value="">Any</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Radius">
          <Select value={v.radiusKm} onChange={(e) => set("radiusKm", e.target.value)} disabled={!v.origin}>
            <option value="">Exact</option>
            {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Destination">
          <Select value={v.dest} onChange={(e) => set("dest", e.target.value)}>
            <option value="">Any</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Dest. country">
          <Select value={v.destCountry} onChange={(e) => set("destCountry", e.target.value)}>
            <option value="">Any</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Loading from"><Input type="date" value={v.loadingFrom} onChange={(e) => set("loadingFrom", e.target.value)} /></Field>
        <Field label="Loading to"><Input type="date" value={v.loadingTo} onChange={(e) => set("loadingTo", e.target.value)} /></Field>
      </div>
      <ChipGroup title="Body type" options={BODY_TYPES.map((b) => [b, label(b)])} value={multi("body")} onToggle={(x) => toggleMulti("body", x)} />
      <ChipGroup title="Cargo" options={CARGO_TYPES.map((b) => [b, label(b)])} value={multi("cargo")} onToggle={(x) => toggleMulti("cargo", x)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Weight min (kg)"><Input type="number" inputMode="numeric" value={v.weightMin} onChange={(e) => set("weightMin", e.target.value)} /></Field>
        <Field label="Weight max (kg)"><Input type="number" inputMode="numeric" value={v.weightMax} onChange={(e) => set("weightMax", e.target.value)} /></Field>
        <Field label="Volume min (m³)"><Input type="number" inputMode="numeric" value={v.volumeMin} onChange={(e) => set("volumeMin", e.target.value)} /></Field>
        <Field label="Distance max (km)"><Input type="number" inputMode="numeric" value={v.distanceMax} onChange={(e) => set("distanceMax", e.target.value)} /></Field>
        <Field label="Rate min ($)"><Input type="number" inputMode="numeric" value={v.rateMin} onChange={(e) => set("rateMin", e.target.value)} /></Field>
        <Field label="Rate/km min ($)"><Input type="number" inputMode="decimal" step="0.05" value={v.ratePerKmMin} onChange={(e) => set("ratePerKmMin", e.target.value)} /></Field>
        <Field label="AI score min"><Input type="number" inputMode="numeric" min={0} max={100} value={v.minScore} onChange={(e) => set("minScore", e.target.value)} /></Field>
        <Field label="Deadhead max (km)"><Input type="number" inputMode="numeric" value={v.maxDeadhead} onChange={(e) => set("maxDeadhead", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Currency">
          <Select value={v.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="">Any</option>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={v.source} onChange={(e) => set("source", e.target.value)}>
            <option value="">Any</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <ChipGroup title="Payment terms" options={PAYMENT_TERMS.map((b) => [b, label(b)])} value={multi("payment")} onToggle={(x) => toggleMulti("payment", x)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.verifiedOnly === "1"} onChange={(e) => set("verifiedOnly", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
        Verified loads only
      </label>
    </div>
  );

  return (
    <>
      <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` · ${activeCount}` : ""}
      </Button>
      {/* Desktop: sticky side panel */}
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Filters</h2>
            {activeCount > 0 && (
              <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          {body}
          <Button className="mt-5 w-full" onClick={apply}>Apply filters</Button>
        </div>
      </aside>
      {/* Mobile: full-height sheet */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close filters" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-fade-up flex-col rounded-t-2xl bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">Filters</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-muted" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{body}</div>
            <div className="flex gap-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={reset}>Reset</Button>
              <Button className="flex-1" onClick={apply}>Show results</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChipGroup({ title, options, value, onToggle }: { title: string; options: [string, string][]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-muted">{title}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={value.includes(k)} className={cn("rounded-md border px-2 py-1 text-xs transition", value.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
