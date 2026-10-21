"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Calendar, ChevronDown, Globe2, RotateCcw, Search, SlidersHorizontal, Truck, X } from "lucide-react";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS } from "@/server/domain/enums";
import { useI18n } from "@/i18n/client";
import { Button, Field, Input, Select } from "../ui/primitives";
import { cn } from "@/lib/format";
import { NEAR_DEFAULT_RADIUS, NearMeButton, NearMeNote, loadLocation, saveLocation, type NearMeStatus } from "./near-me";

type Opt = { id: string; name: string };

const KEYS = [
  "origin", "radiusKm", "dest", "destRadiusKm", "destCountry", "originCountry", "scope", "loadingFrom", "loadingTo", "cargo", "body", "weightMin", "weightMax", "volumeMin",
  "rateMin", "ratePerKmMin", "currency", "payment", "source", "verifiedOnly", "minGrade", "freshHours", "hasRate", "minScore", "maxDeadhead", "truckId", "brokerId", "distanceMin", "distanceMax",
];

const SCOPES = [
  ["", "any"],
  ["domestic", "scopeDomestic"],
  ["international", "scopeInternational"],
  ["export", "scopeExport"],
  ["import", "scopeImport"],
  ["transit", "scopeTransit"],
] as const;

/**
 * A DAT-style compact search bar: a handful of always-visible fields in one row (origin,
 * deadhead radius, destination, equipment, date range, search), with the rest of the same
 * filters grouped behind two dropdown buttons ("Load requirements", "More filters") instead of
 * a long scrolling sidebar form. Same URL-param-driven filter state as before — just a denser,
 * single-row layout for desktop. Mobile keeps a full-screen sheet with everything in one list.
 */
export function SearchToolbar({ trucks, sources, brokers }: { trucks: Opt[]; sources: Opt[]; brokers: Opt[] }) {
  const { t, label, city, country, m } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [near, setNear] = useState<NearMeStatus>(null);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])));
  useEffect(() => {
    const saved = loadLocation();
    if (saved && saved.cityId === sp.get("origin")) setNear({ kind: "ok", ...saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearNear = () => {
    saveLocation(null);
    setNear(null);
  };
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const multi = (k: string) => (v[k] ? v[k].split(",") : []);
  const toggleMulti = (k: string, item: string) => {
    const cur = multi(k);
    set(k, (cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]).join(","));
  };
  const activeCount = KEYS.filter((k) => sp.get(k)).length;

  function go(vals: Record<string, string>) {
    const p = new URLSearchParams();
    for (const k of ["sort", "view"]) if (sp.get(k)) p.set(k, sp.get(k)!);
    for (const [k, val] of Object.entries(vals)) if (val) p.set(k, val);
    router.push(`${path}?${p.toString()}`);
    setMobileOpen(false);
  }
  const apply = () => go(v);
  /** "Near me": search from the nearest city, keeping a radius the user already chose. */
  function searchNear(cityId: string) {
    const next = { ...v, origin: cityId, radiusKm: v.radiusKm || String(NEAR_DEFAULT_RADIUS) };
    setV(next);
    go(next);
  }
  function reset() {
    setV(Object.fromEntries(KEYS.map((k) => [k, ""])));
    const p = new URLSearchParams();
    if (sp.get("view")) p.set("view", sp.get("view")!);
    router.push(`${path}?${p.toString()}`);
    setMobileOpen(false);
  }

  const dateSummary =
    v.loadingFrom || v.loadingTo || v.unloadingTo
      ? `${v.loadingFrom || t("toolbar.any")} – ${v.loadingTo || t("toolbar.any")}${v.unloadingTo ? `, ${t("toolbar.unloadByDate", { date: v.unloadingTo })}` : ""}`
      : t("toolbar.anyDate");
  const requirementsCount = ["cargo", "payment", "verifiedOnly", "minGrade", "freshHours", "hasRate"].filter((k) => v[k]).length;
  const moreCount = ["weightMin", "weightMax", "volumeMin", "rateMin", "ratePerKmMin", "minScore", "maxDeadhead", "distanceMin", "distanceMax", "currency", "source", "brokerId"].filter((k) => v[k]).length;
  const routeCount = ["originCountry", "destCountry", "scope"].filter((k) => v[k]).length;
  // Staged (v) vs. applied (the URL) — surfaced next to Search so a changed-but-unapplied filter
  // set is never silently ignored.
  const dirty = useMemo(() => KEYS.some((k) => (v[k] || "") !== (sp.get(k) || "")), [v, sp]);

  const allFields = (
    <FieldGroup
      trucks={trucks}
      sources={sources}
      brokers={brokers}
      v={v}
      set={set}
      multi={multi}
      toggleMulti={toggleMulti}
      near={near}
      setNear={setNear}
      searchNear={searchNear}
      clearNear={clearNear}
      layout="stacked"
    />
  );

  return (
    <>
      {/* Mobile: a single button that opens a full sheet, same as before */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setMobileOpen(true)} className="flex-1">
          <SlidersHorizontal className="h-4 w-4" /> {t("toolbar.searchFilters")}{activeCount ? ` · ${activeCount}` : ""}
        </Button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("toolbar.searchAndFilters")}>
          <button className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label={t("nav.close")} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] animate-fade-up flex-col rounded-t-2xl bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">{t("toolbar.searchFilters")}</h2>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-muted" aria-label={t("nav.close")}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{allFields}</div>
            <div className="flex gap-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={reset}>{t("toolbar.reset")}</Button>
              <Button className="flex-1" onClick={apply}>{t("toolbar.showResults")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: compact DAT-style bar */}
      <div className="hidden rounded-xl border border-border bg-surface p-3 lg:block">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label={t("toolbar.origin")} className="w-44">
            <Select value={v.origin} onChange={(e) => set("origin", e.target.value)}>
              <option value="">{t("toolbar.any")}</option>
              {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
            </Select>
          </Field>
          <NearMeButton onFound={(r) => searchNear(r.cityId)} onStatus={setNear} status={near} />
          <Field label={t("toolbar.dhO")} className="w-28">
            <Select value={v.radiusKm} onChange={(e) => set("radiusKm", e.target.value)} disabled={!v.origin}>
              <option value="">{t("toolbar.exact")}</option>
              {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} {m.units.km}</option>)}
            </Select>
          </Field>
          <button
            type="button"
            title={t("toolbar.swap")}
            aria-label={t("toolbar.swap")}
            onClick={() => setV((s) => ({ ...s, origin: s.dest, dest: s.origin, radiusKm: s.destRadiusKm, destRadiusKm: s.radiusKm, originCountry: s.destCountry, destCountry: s.originCountry }))}
            className="mb-[9px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition hover:border-brand hover:text-brand"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <Field label={t("toolbar.dest")} className="w-44">
            <Select value={v.dest} onChange={(e) => set("dest", e.target.value)}>
              <option value="">{t("toolbar.any")}</option>
              {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
            </Select>
          </Field>
          <Field label={t("toolbar.dhD")} className="w-28">
            <Select value={v.destRadiusKm} onChange={(e) => set("destRadiusKm", e.target.value)} disabled={!v.dest}>
              <option value="">{t("toolbar.exact")}</option>
              {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} {m.units.km}</option>)}
            </Select>
          </Field>
          <Dropdown label={t("toolbar.routeType")} count={routeCount} icon={<Globe2 className="h-3.5 w-3.5" />}>
            <div className="w-64 space-y-3 p-1">
              <Field label={t("toolbar.originCountry")}>
                <Select value={v.originCountry} onChange={(e) => set("originCountry", e.target.value)}>
                  <option value="">{t("toolbar.any")}</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{country(c.code)}</option>)}
                </Select>
              </Field>
              <Field label={t("toolbar.destCountry")}>
                <Select value={v.destCountry} onChange={(e) => set("destCountry", e.target.value)}>
                  <option value="">{t("toolbar.any")}</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{country(c.code)}</option>)}
                </Select>
              </Field>
              <Field label={t("toolbar.routeType")}>
                <Select value={v.scope} onChange={(e) => set("scope", e.target.value)}>
                  {SCOPES.map(([k, l]) => <option key={k} value={k}>{t(`toolbar.${l}`)}</option>)}
                </Select>
              </Field>
            </div>
          </Dropdown>
          <Dropdown label={t("toolbar.equipment")} count={multi("body").length} icon={<ChevronDown className="h-3.5 w-3.5" />}>
            <ChipGroup options={BODY_TYPES.map((b) => [b, label(b)])} value={multi("body")} onToggle={(x) => toggleMulti("body", x)} />
          </Dropdown>
          <Dropdown label={t("toolbar.dateRange")} summary={dateSummary} icon={<Calendar className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-2 gap-2 p-1">
              <Field label={t("toolbar.loadingFrom")}><Input type="date" value={v.loadingFrom} onChange={(e) => set("loadingFrom", e.target.value)} /></Field>
              <Field label={t("toolbar.loadingTo")}><Input type="date" value={v.loadingTo} onChange={(e) => set("loadingTo", e.target.value)} /></Field>
              <Field label={t("toolbar.unloadBy")} className="col-span-2"><Input type="date" value={v.unloadingTo} onChange={(e) => set("unloadingTo", e.target.value)} /></Field>
            </div>
          </Dropdown>
          <Field label={t("toolbar.scoreForTruck")} className="w-72">
            <Select value={v.truckId} onChange={(e) => set("truckId", e.target.value)}>
              <option value="">{t("toolbar.bestTruck")}</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {dirty && (
              <span className="hidden items-center gap-1.5 text-xs font-medium text-brand sm:flex">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden /> {t("toolbar.unapplied")}
              </span>
            )}
            <Button onClick={apply} className={cn("h-9", dirty && "ring-2 ring-[var(--ring)]")}><Search className="h-4 w-4" /> {t("toolbar.search")}</Button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <Dropdown label={t("toolbar.loadRequirements")} count={requirementsCount}>
            <div className="space-y-4 p-1">
              <ChipGroup title={t("toolbar.cargo")} options={CARGO_TYPES.map((b) => [b, label(b)])} value={multi("cargo")} onToggle={(x) => toggleMulti("cargo", x)} />
              <ChipGroup title={t("toolbar.payment")} options={PAYMENT_TERMS.map((b) => [b, label(b)])} value={multi("payment")} onToggle={(x) => toggleMulti("payment", x)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("grade.filter")}>
                  <Select value={v.minGrade} onChange={(e) => set("minGrade", e.target.value)}>
                    <option value="">{t("grade.any")}</option>
                    <option value="A">{t("grade.a")}</option>
                    <option value="B">{t("grade.b")}</option>
                    <option value="C">{t("grade.c")}</option>
                  </Select>
                </Field>
                <Field label={t("grade.fresh")}>
                  <Select value={v.freshHours} onChange={(e) => set("freshHours", e.target.value)}>
                    <option value="">{t("grade.freshAny")}</option>
                    <option value="1">{t("grade.h1")}</option>
                    <option value="6">{t("grade.h6")}</option>
                    <option value="24">{t("grade.h24")}</option>
                    <option value="72">{t("grade.h72")}</option>
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.hasRate === "1"} onChange={(e) => set("hasRate", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
                {t("toolbar.publishedOnly")} <span className="text-xs text-subtle">{t("toolbar.excludesNegotiable")}</span>
              </label>
            </div>
          </Dropdown>
          <Dropdown label={t("toolbar.moreFilters")} count={moreCount}>
            <div className="grid w-80 grid-cols-2 gap-2 p-1">
              <Field label={t("toolbar.weightMin")}><Input type="number" inputMode="numeric" value={v.weightMin} onChange={(e) => set("weightMin", e.target.value)} /></Field>
              <Field label={t("toolbar.weightMax")}><Input type="number" inputMode="numeric" value={v.weightMax} onChange={(e) => set("weightMax", e.target.value)} /></Field>
              <Field label={t("toolbar.volumeMin")}><Input type="number" inputMode="numeric" value={v.volumeMin} onChange={(e) => set("volumeMin", e.target.value)} /></Field>
              <Field label={t("toolbar.distanceMin")}><Input type="number" inputMode="numeric" value={v.distanceMin} onChange={(e) => set("distanceMin", e.target.value)} /></Field>
              <Field label={t("toolbar.distanceMax")}><Input type="number" inputMode="numeric" value={v.distanceMax} onChange={(e) => set("distanceMax", e.target.value)} /></Field>
              <Field label={t("toolbar.rateMin")}><Input type="number" inputMode="numeric" value={v.rateMin} onChange={(e) => set("rateMin", e.target.value)} /></Field>
              <Field label={t("toolbar.ratePerKmMin")}><Input type="number" inputMode="decimal" step="0.05" value={v.ratePerKmMin} onChange={(e) => set("ratePerKmMin", e.target.value)} /></Field>
              <Field label={t("toolbar.scoreMin")}><Input type="number" inputMode="numeric" min={0} max={100} value={v.minScore} onChange={(e) => set("minScore", e.target.value)} /></Field>
              <Field label={t("toolbar.deadheadMax")}><Input type="number" inputMode="numeric" value={v.maxDeadhead} onChange={(e) => set("maxDeadhead", e.target.value)} /></Field>
              <Field label={t("toolbar.currency")}>
                <Select value={v.currency} onChange={(e) => set("currency", e.target.value)}>
                  <option value="">{t("toolbar.any")}</option>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label={t("toolbar.source")}>
                <Select value={v.source} onChange={(e) => set("source", e.target.value)}>
                  <option value="">{t("toolbar.any")}</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label={t("toolbar.broker")}>
                <Select value={v.brokerId} onChange={(e) => set("brokerId", e.target.value)}>
                  <option value="">{t("toolbar.any")}</option>
                  {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </div>
          </Dropdown>
          {activeCount > 0 && (
            <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <RotateCcw className="h-3 w-3" /> {t("toolbar.resetAll")}{activeCount ? ` (${activeCount})` : ""}
            </button>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-subtle">
            <Truck className="h-3.5 w-3.5" /> {t("toolbar.footnote")}
          </span>
        </div>
        <NearMeNote status={near} originId={v.origin} radiusKm={v.radiusKm} onClear={clearNear} />
      </div>
    </>
  );
}

function FieldGroup({ trucks, sources, brokers, v, set, multi, toggleMulti, near, setNear, searchNear, clearNear }: {
  trucks: Opt[]; sources: Opt[]; brokers: Opt[];
  v: Record<string, string>; set: (k: string, val: string) => void; multi: (k: string) => string[]; toggleMulti: (k: string, item: string) => void;
  near: NearMeStatus; setNear: (s: NearMeStatus) => void; searchNear: (cityId: string) => void; clearNear: () => void;
  layout: "stacked";
}) {
  const { t, label, city, country, m } = useI18n();
  return (
    <div className="space-y-4">
      <Field label={t("toolbar.scoreForTruck")}>
        <Select value={v.truckId} onChange={(e) => set("truckId", e.target.value)}>
          <option value="">{t("toolbar.bestTruck")}</option>
          {trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label={t("toolbar.origin")}>
          <Select value={v.origin} onChange={(e) => set("origin", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
          </Select>
        </Field>
        <Field label={t("toolbar.dhO")}>
          <Select value={v.radiusKm} onChange={(e) => set("radiusKm", e.target.value)} disabled={!v.origin}>
            <option value="">{t("toolbar.exact")}</option>
            {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} {m.units.km}</option>)}
          </Select>
        </Field>
      </div>
      <NearMeButton withLabel className="w-full" onFound={(r) => searchNear(r.cityId)} onStatus={setNear} status={near} />
      <NearMeNote status={near} originId={v.origin} radiusKm={v.radiusKm} onClear={clearNear} />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label={t("toolbar.dest")}>
          <Select value={v.dest} onChange={(e) => set("dest", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
          </Select>
        </Field>
        <Field label={t("toolbar.dhD")}>
          <Select value={v.destRadiusKm} onChange={(e) => set("destRadiusKm", e.target.value)} disabled={!v.dest}>
            <option value="">{t("toolbar.exact")}</option>
            {[50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} {m.units.km}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("toolbar.originCountry")}>
          <Select value={v.originCountry} onChange={(e) => set("originCountry", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{country(c.code)}</option>)}
          </Select>
        </Field>
        <Field label={t("toolbar.destCountry")}>
          <Select value={v.destCountry} onChange={(e) => set("destCountry", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{country(c.code)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("toolbar.routeType")}>
        <Select value={v.scope} onChange={(e) => set("scope", e.target.value)}>
          {SCOPES.map(([k, l]) => <option key={k} value={k}>{t(`toolbar.${l}`)}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("toolbar.loadingFrom")}><Input type="date" value={v.loadingFrom} onChange={(e) => set("loadingFrom", e.target.value)} /></Field>
        <Field label={t("toolbar.loadingTo")}><Input type="date" value={v.loadingTo} onChange={(e) => set("loadingTo", e.target.value)} /></Field>
      </div>
      <Field label={t("toolbar.unloadBy")}><Input type="date" value={v.unloadingTo} onChange={(e) => set("unloadingTo", e.target.value)} /></Field>
      <ChipGroup title={t("toolbar.equipment")} options={BODY_TYPES.map((b) => [b, label(b)])} value={multi("body")} onToggle={(x) => toggleMulti("body", x)} />
      <ChipGroup title={t("toolbar.cargo")} options={CARGO_TYPES.map((b) => [b, label(b)])} value={multi("cargo")} onToggle={(x) => toggleMulti("cargo", x)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("toolbar.weightMin")}><Input type="number" inputMode="numeric" value={v.weightMin} onChange={(e) => set("weightMin", e.target.value)} /></Field>
        <Field label={t("toolbar.weightMax")}><Input type="number" inputMode="numeric" value={v.weightMax} onChange={(e) => set("weightMax", e.target.value)} /></Field>
        <Field label={t("toolbar.volumeMin")}><Input type="number" inputMode="numeric" value={v.volumeMin} onChange={(e) => set("volumeMin", e.target.value)} /></Field>
        <Field label={t("toolbar.distanceMin")}><Input type="number" inputMode="numeric" value={v.distanceMin} onChange={(e) => set("distanceMin", e.target.value)} /></Field>
        <Field label={t("toolbar.distanceMax")}><Input type="number" inputMode="numeric" value={v.distanceMax} onChange={(e) => set("distanceMax", e.target.value)} /></Field>
        <Field label={t("toolbar.rateMin")}><Input type="number" inputMode="numeric" value={v.rateMin} onChange={(e) => set("rateMin", e.target.value)} /></Field>
        <Field label={t("toolbar.ratePerKmMin")}><Input type="number" inputMode="decimal" step="0.05" value={v.ratePerKmMin} onChange={(e) => set("ratePerKmMin", e.target.value)} /></Field>
        <Field label={t("toolbar.scoreMin")}><Input type="number" inputMode="numeric" min={0} max={100} value={v.minScore} onChange={(e) => set("minScore", e.target.value)} /></Field>
        <Field label={t("toolbar.deadheadMax")}><Input type="number" inputMode="numeric" value={v.maxDeadhead} onChange={(e) => set("maxDeadhead", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("toolbar.currency")}>
          <Select value={v.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("toolbar.source")}>
          <Select value={v.source} onChange={(e) => set("source", e.target.value)}>
            <option value="">{t("toolbar.any")}</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("toolbar.broker")}>
        <Select value={v.brokerId} onChange={(e) => set("brokerId", e.target.value)}>
          <option value="">{t("toolbar.any")}</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <ChipGroup title={t("toolbar.payment")} options={PAYMENT_TERMS.map((b) => [b, label(b)])} value={multi("payment")} onToggle={(x) => toggleMulti("payment", x)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("grade.filter")}>
          <Select value={v.minGrade} onChange={(e) => set("minGrade", e.target.value)}>
            <option value="">{t("grade.any")}</option>
            <option value="A">{t("grade.a")}</option>
            <option value="B">{t("grade.b")}</option>
            <option value="C">{t("grade.c")}</option>
          </Select>
        </Field>
        <Field label={t("grade.fresh")}>
          <Select value={v.freshHours} onChange={(e) => set("freshHours", e.target.value)}>
            <option value="">{t("grade.freshAny")}</option>
            <option value="1">{t("grade.h1")}</option>
            <option value="6">{t("grade.h6")}</option>
            <option value="24">{t("grade.h24")}</option>
            <option value="72">{t("grade.h72")}</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.hasRate === "1"} onChange={(e) => set("hasRate", e.target.checked ? "1" : "")} className="h-4 w-4 accent-[var(--brand)]" />
        {t("toolbar.publishedOnly")} <span className="text-xs text-subtle">{t("toolbar.excludesNegotiable")}</span>
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
