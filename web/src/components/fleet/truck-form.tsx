"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { CITIES } from "@/server/domain/geo";
import { BODY_TYPES, TRUCK_STATUSES, TRUCK_TYPES } from "@/server/domain/enums";
import { typicalPassport } from "@/server/domain/fit";
import { PASSPORT_NUMBERS } from "@/lib/truck-passport";
import { useI18n } from "@/i18n/client";
import { useDialog } from "../ui/dialog";
import { Button, Field, Input, Select } from "../ui/primitives";

export interface TruckFormValues {
  code: string;
  plate: string;
  truckType: string;
  bodyType: string;
  capacityKg: number;
  volumeM3: number;
  currentCityId: string;
  status: string;
  availableFrom: string;
  driverName: string;
  fuelLPer100km: number;
  fuelPriceUsd: number;
  driverCostPerKm: number;
  maintenancePerKm: number;
  otherPerTripUsd: number;
  // Passport, as typed: "" = unknown.
  cargoLengthM: string; cargoWidthM: string; cargoHeightM: string;
  heightM: string; widthM: string; lengthM: string;
  grossWeightKg: string; axles: string; axleLoadKg: string;
  adr: boolean;
  crew: number;
  fuelByCountry: boolean;
}


export function TruckForm({ id, initial, canDelete }: { id?: string; initial: TruckFormValues; canDelete?: boolean }) {
  const { t, label, city } = useI18n();
  const dialog = useDialog();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [filled, setFilled] = useState(false);
  const set = <K extends keyof TruckFormValues>(k: K, val: TruckFormValues[K]) => (setSaved(false), setV((s) => ({ ...s, [k]: val })));
  const text = (k: keyof TruckFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);
  const num = (k: keyof TruckFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = {
        ...v, plate: v.plate || null, driverName: v.driverName || null,
        ...Object.fromEntries(PASSPORT_NUMBERS.map((k) => [k, v[k].trim() === "" ? null : Number(v[k].replace(",", "."))])),
      };
      if (id) {
        await apiCall(`/api/trucks/${id}`, "PATCH", body);
        setSaved(true);
        router.refresh();
      } else {
        const r = await apiCall<{ id: string }>("/api/trucks", "POST", body);
        router.push(`/app/fleet/${r.id}`);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  function fillTypical() {
    const p = typicalPassport(v.truckType, v.bodyType);
    setSaved(false);
    setFilled(true);
    setV((s) => ({ ...s, ...Object.fromEntries(PASSPORT_NUMBERS.map((k) => [k, String(p[k])])) as Record<(typeof PASSPORT_NUMBERS)[number], string> }));
  }

  async function remove() {
    if (!id || !(await dialog.confirm({ title: t("fleet.deleteTitle", { code: v.code }), message: t("fleet.deleteBody"), danger: true }))) return;
    setPending(true);
    try {
      await apiCall(`/api/trucks/${id}`, "DELETE");
      router.push("/app/fleet");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">{t("fleet.vehicle")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("fleet.code")}><Input required value={v.code} onChange={(e) => set("code", e.target.value)} placeholder="T-1024" /></Field>
          <Field label={t("fleet.plate")}><Input value={v.plate} onChange={(e) => set("plate", e.target.value)} /></Field>
          <Field label={t("fleet.driverOptional")}><Input value={v.driverName} onChange={(e) => set("driverName", e.target.value)} /></Field>
          <Field label={t("fleet.type")}>
            <Select value={v.truckType} onChange={(e) => set("truckType", e.target.value)}>{TRUCK_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          </Field>
          <Field label={t("fleet.body")}>
            <Select value={v.bodyType} onChange={(e) => set("bodyType", e.target.value)}>{BODY_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("fleet.capacity")}><Input type="number" inputMode="numeric" min={500} max={60000} step={500} value={v.capacityKg} onChange={num("capacityKg")} /></Field>
            <Field label={t("fleet.volume")}><Input type="number" inputMode="decimal" min={1} max={200} value={v.volumeM3} onChange={num("volumeM3")} /></Field>
          </div>
        </div>
      </section>
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("pass.title")}</h3>
          <Button type="button" variant="ghost" onClick={fillTypical}>{t("pass.fill")}</Button>
        </div>
        <p className="mb-3 text-xs text-muted">{filled ? t("pass.filled") : t("pass.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted">{t("pass.cargoSpace")}</legend>
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("pass.length")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.cargoLengthM} onChange={text("cargoLengthM")} /></Field>
              <Field label={t("pass.width")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.cargoWidthM} onChange={text("cargoWidthM")} /></Field>
              <Field label={t("pass.height")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.cargoHeightM} onChange={text("cargoHeightM")} /></Field>
            </div>
          </fieldset>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted">{t("pass.vehicle")}</legend>
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("pass.length")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.lengthM} onChange={text("lengthM")} /></Field>
              <Field label={t("pass.width")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.widthM} onChange={text("widthM")} /></Field>
              <Field label={t("pass.height")}><Input type="number" inputMode="decimal" step="0.05" min={0} value={v.heightM} onChange={text("heightM")} /></Field>
            </div>
          </fieldset>
          <Field label={t("pass.gross")}><Input type="number" inputMode="numeric" step="500" min={0} value={v.grossWeightKg} onChange={text("grossWeightKg")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("pass.axles")}><Input type="number" inputMode="numeric" min={0} value={v.axles} onChange={text("axles")} /></Field>
            <Field label={t("pass.axleLoad")}><Input type="number" inputMode="numeric" step="500" min={0} value={v.axleLoadKg} onChange={text("axleLoadKg")} /></Field>
          </div>
          <Field label={t("hos.crew")} hint={t("hos.crewHint")}>
            <Select value={v.crew} onChange={(e) => set("crew", Number(e.target.value))}>
              <option value={1}>{t("hos.crewOne")}</option>
              <option value={2}>{t("hos.crewTwo")}</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={v.adr} onChange={(e) => set("adr", e.target.checked)} className="h-4 w-4" /> {t("pass.adr")}
          </label>
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">{t("fleet.statusLocation")}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("fleet.location")}>
            <Select value={v.currentCityId} onChange={(e) => set("currentCityId", e.target.value)}>{CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}</Select>
          </Field>
          <Field label={t("fleet.colStatus")}>
            <Select value={v.status} onChange={(e) => set("status", e.target.value)}>{TRUCK_STATUSES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          </Field>
          <Field label={t("fleet.availableFrom")}><Input type="datetime-local" value={v.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} /></Field>
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold">{t("fleet.costProfile")}</h3>
        <p className="mb-3 text-xs text-muted">{t("fleet.costProfileHint")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field label={t("fleet.fuelCons")}><Input type="number" inputMode="decimal" step="0.5" value={v.fuelLPer100km} onChange={num("fuelLPer100km")} /></Field>
          <label className="col-span-2 flex items-start gap-2 text-sm sm:col-span-3 lg:col-span-5">
            <input type="checkbox" checked={v.fuelByCountry} onChange={(e) => set("fuelByCountry", e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>{t("fuel.byCountry")}<span className="block text-xs text-muted">{t("fuel.byCountryHint")}</span></span>
          </label>
          <Field label={t("fleet.fuelPrice")}><Input type="number" inputMode="decimal" step="0.01" disabled={v.fuelByCountry} value={v.fuelPriceUsd} onChange={num("fuelPriceUsd")} /></Field>
          <Field label={t("fleet.driverKm")}><Input type="number" inputMode="decimal" step="0.01" value={v.driverCostPerKm} onChange={num("driverCostPerKm")} /></Field>
          <Field label={t("fleet.maintKm")}><Input type="number" inputMode="decimal" step="0.01" value={v.maintenancePerKm} onChange={num("maintenancePerKm")} /></Field>
          <Field label={t("fleet.otherTrip")}><Input type="number" inputMode="decimal" step="5" value={v.otherPerTripUsd} onChange={num("otherPerTripUsd")} /></Field>
        </div>
      </section>
      {error && <p role="alert" className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{id ? t("fleet.saveChanges") : t("dash.addTruck")}</Button>
        {saved && <span className="text-sm text-pos">{t("board.saved")}</span>}
        {id && canDelete && (
          <Button type="button" variant="ghost" className="ml-auto text-neg" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4" /> {t("fleet.delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
