"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Calendar, ChevronDown, RotateCcw, Search, SlidersHorizontal, Truck, X } from "lucide-react";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS, label } from "@/server/domain/enums";
import { Button, Field, Input, Select } from "../ui/primitives";
import { cn } from "@/lib/format";

type Opt = { id: string; name: string };

const KEYS = [
  "origin", "radiusKm", "dest", "destRadiusKm", "destCountry", "originCountry", "scope", "loadingFrom", "loadingTo", "cargo", "body", "weightMin", "weightMax", "volumeMin",
  "rateMin", "ratePerKmMin", "currency", "payment", "source", "verifiedOnly", "hasRate", "minScore", "maxDeadhead", "truckId", "brokerId", "distanceMin", "distanceMax",
];

const SCOPES = [
  ["", "Any"],
  ["domestic", "Domestic (within Uzbekistan)"],
  ["export", "Export (from Uzbekistan)"],
  ["import", "Import (into Uzbekistan)"],
  ["transit", "Other international"],
] as const;

/**
 * A DAT-style compact search bar: a handful of always-visible fields in one row (origin,
 * deadhead radius, destination, equipment, date range, search), with the rest of the same
 * filters grouped behind two dropdown buttons ("Load requirements", "More filters") instead of
 * a long scrolling sidebar form. Same URL-param-driven filter state as before — just a denser,
 * single-row layout for desktop. Mobile keeps a full-screen sheet with everything in one list.
 */
export function SearchToolbar({ trucks, sources }: { trucks: Opt[]; sources: Opt[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
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
    setMobileOpen(false);
  }
  function reset() {
    setV(Object.fromEntries(KEYS.map((k) => [k, ""])));
    const p = new URLSearchParams();
    if (sp.get("view")) p.set("view", sp.get("view")!);
    router.push(`${path}?${p.toString()}`);
    setMobileOpen(false);
  }

  const dateSummary = v.loadingFrom || v.loadingTo ? `${v.loadingFrom || "Any"} – ${v.loadingTo || "Any"}` : "Any date";
  const requirementsCount = ["cargo", "payment", "verifiedOnly", "hasRate"].filter((k) => v[k]).length;
  const moreCount = ["weightMin", "weightMax", "volumeMin", "rateMin", "ratePerKmMin", "minScore", "maxDeadhead", "distanceMin", "distanceMax", "currency", "source", "brokerId"].filter((k) => v[k]).length;

  const allFields = (
    <FieldGroup
      trucks={trucks}
      sources={sources}
      v={v}
      set={set}
      multi={multi}
      toggleMulti={toggleMulti}
      layout="stacked"
    />
  );

  return (
    <>
      {/* Mobile: a single button that opens a full sheet, same as before */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setMobileOpen(true)} className="flex-1">
          <SlidersHorizontal className="h-4 w-4" /> Search & filters{activeCount ? ` · ${activeCount}` : ""}
        </Button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Search and filters">
          <button className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Close" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] animate-fade-up flex-col rounded-t-2xl bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">Search & filters</h2>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-muted" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{allFields}</div>
            <div className="flex gap-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={reset}>Reset</Button>
              <Button className="flex-1" onClick={apply}>Show results</Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: compact DAT-style bar */}
      <div className="hidden rounded-xl border border-border bg-surface p-3 lg:block">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Origin" className="w-44">
            <Select value={v.origin} onChange={(e) => set("origin", e.target.value)}>
              <option value="">Any</option>
              {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="DH-O" hint={v.radiusKm ? `Within ${v.radiusKm} km of origin` : undefined} className="w-24">
            <Select value={v.radiusKm} onChange={(e) => set("radiusKm", e.target.value)} disabled={!v.origin}>
              <option value="">Exact</option>
              {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
            </Select>
          </Field>
          <button
            type="button"
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
            onClick={() => setV((s) => ({ ...s, origin: s.dest, dest: s.origin, radiusKm: s.destRadiusKm, destRadiusKm: s.radiusKm }))}
            className="mb-[9px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition hover:border-brand hover:text-brand"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <Field label="Destination" className="w-44">
            <Select value={v.dest} onChange={(e) => set("dest", e.target.value)}>
              <option value="">Any</option>
              {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="DH-D" hint={v.destRadiusKm ? `Within ${v.destRadiusKm} km of destination` : undefined} className="w-24">
            <Select value={v.destRadiusKm} onChange={(e) => set("destRadiusKm", e.target.value)} disabled={!v.dest}>
              <option value="">Exact</option>
              {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
            </Select>
          </Field>
          <Field label="Dest. country" className="w-32">
            <Select value={v.destCountry} onChange={(e) => set("destCountry", e.target.value)}>
              <option value="">Any</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Route type" className="w-40">
            <Select value={v.scope} onChange={(e) => set("scope", e.target.value)}>
              {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Dropdown label="Equipment" count={multi("body").length} icon={<ChevronDown className="h-3.5 w-3.5" />}>
            <ChipGroup options={BODY_TYPES.map((b) => [b, label(b)])} value={multi("body")} onToggle={(x) => toggleMulti("body", x)} />
          </Dropdown>
          <Dropdown label="Date range" summary={dateSummary} icon={<Calendar className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-2 gap-2 p-1">
              <Field label="Loading from"><Input type="date" value={v.loadingFrom} onChange={(e) => set("loadingFrom", e.target.value)} /></Field>
              <Field label="Loading to"><Input type="date" value={v.loadingTo} onChange={(e) => set("loadingTo", e.target.value)} /></Field>
            </div>
          </Dropdown>
          <Field label="Score for truck" className="w-48">
            <Select value={v.truckId} onChange={(e) => set("truckId", e.target.value)}>
              <option value="">Best truck in my fleet</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Button onClick={apply} className="h-9"><Search className="h-4 w-4" /> Search</Button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <Dropdown label="Load requirements" count={requirementsCount}>
            <div className="space-y-4 p-1">
              <ChipGroup title="Cargo" options={CARGO_TYPES.map((b) => [b, label(b)])} value={multi("cargo")} onToggle={(x) => toggleMulti("cargo", x)} />
              <ChipGroup title="Payment terms" options={PAYMENT_TERMS.map((b) => [b, label(b)])} value={multi("payment")} onToggle={(x) => toggleMulti("payment", x)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.verifiedOnly === "1"} onChange={(e) => set("verifiedOnly", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
                Verified loads only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.hasRate === "1"} onChange={(e) => set("hasRate", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
                Published rate only <span className="text-xs text-subtle">(excludes negotiable)</span>
              </label>
            </div>
          </Dropdown>
          <Dropdown label="More filters" count={moreCount}>
            <div className="grid w-80 grid-cols-2 gap-2 p-1">
              <Field label="Weight min (kg)"><Input type="number" inputMode="numeric" value={v.weightMin} onChange={(e) => set("weightMin", e.target.value)} /></Field>
              <Field label="Weight max (kg)"><Input type="number" inputMode="numeric" value={v.weightMax} onChange={(e) => set("weightMax", e.target.value)} /></Field>
              <Field label="Volume min (m³)"><Input type="number" inputMode="numeric" value={v.volumeMin} onChange={(e) => set("volumeMin", e.target.value)} /></Field>
              <Field label="Distance max (km)"><Input type="number" inputMode="numeric" value={v.distanceMax} onChange={(e) => set("distanceMax", e.target.value)} /></Field>
              <Field label="Rate min ($)"><Input type="number" inputMode="numeric" value={v.rateMin} onChange={(e) => set("rateMin", e.target.value)} /></Field>
              <Field label="Rate/km min ($)"><Input type="number" inputMode="decimal" step="0.05" value={v.ratePerKmMin} onChange={(e) => set("ratePerKmMin", e.target.value)} /></Field>
              <Field label="AI score min"><Input type="number" inputMode="numeric" min={0} max={100} value={v.minScore} onChange={(e) => set("minScore", e.target.value)} /></Field>
              <Field label="Deadhead max (km)"><Input type="number" inputMode="numeric" value={v.maxDeadhead} onChange={(e) => set("maxDeadhead", e.target.value)} /></Field>
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
          </Dropdown>
          {activeCount > 0 && (
            <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <RotateCcw className="h-3 w-3" /> Reset all{activeCount ? ` (${activeCount})` : ""}
            </button>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-subtle">
            <Truck className="h-3.5 w-3.5" /> Filters update the whole board — hit Search to apply
          </span>
        </div>
      </div>
    </>
  );
}

function FieldGroup({ trucks, sources, v, set, multi, toggleMulti }: {
  trucks: Opt[]; sources: Opt[];
  v: Record<string, string>; set: (k: string, val: string) => void; multi: (k: string) => string[]; toggleMulti: (k: string, item: string) => void;
  layout: "stacked";
}) {
  return (
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
        <Field label="DH-O">
          <Select value={v.radiusKm} onChange={(e) => set("radiusKm", e.target.value)} disabled={!v.origin}>
            <option value="">Exact</option>
            {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label="Destination">
          <Select value={v.dest} onChange={(e) => set("dest", e.target.value)}>
            <option value="">Any</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="DH-D">
          <Select value={v.destRadiusKm} onChange={(e) => set("destRadiusKm", e.target.value)} disabled={!v.dest}>
            <option value="">Exact</option>
            {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Dest. country">
          <Select value={v.destCountry} onChange={(e) => set("destCountry", e.target.value)}>
            <option value="">Any</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Route type">
          <Select value={v.scope} onChange={(e) => set("scope", e.target.value)}>
            {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Loading from"><Input type="date" value={v.loadingFrom} onChange={(e) => set("loadingFrom", e.target.value)} /></Field>
        <Field label="Loading to"><Input type="date" value={v.loadingTo} onChange={(e) => set("loadingTo", e.target.value)} /></Field>
      </div>
      <ChipGroup title="Equipment" options={BODY_TYPES.map((b) => [b, label(b)])} value={multi("body")} onToggle={(x) => toggleMulti("body", x)} />
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.hasRate === "1"} onChange={(e) => set("hasRate", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
        Published rate only <span className="text-xs text-subtle">(excludes negotiable)</span>
      </label>
    </div>
  );
}

/** Small dropdown trigger + absolutely-positioned panel, closes on outside click. Matches the
 * existing account-menu pattern in shell/nav.tsx rather than introducing a new UI dependency. */
function Dropdown({ label: l, summary, count, icon, children }: { label: string; summary?: string; count?: number; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition",
          open || count ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-fg hover:border-border-strong",
        )}
      >
        {icon}
        <span>{l}{count ? ` · ${count}` : ""}</span>
        {summary && <span className="hidden text-xs text-muted sm:inline">({summary})</span>}
        {!icon && <ChevronDown className="h-3.5 w-3.5 text-subtle" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[16rem] rounded-xl border border-border bg-surface p-3 shadow-pop">
          {children}
        </div>
      )}
    </div>
  );
}

function ChipGroup({ title, options, value, onToggle }: { title?: string; options: [string, string][]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset>
      {title && <legend className="mb-1.5 text-xs font-medium text-muted">{title}</legend>}
      <div className="flex max-w-xs flex-wrap gap-1">
        {options.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={value.includes(k)} className={cn("rounded-md border px-2 py-1 text-xs transition", value.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
