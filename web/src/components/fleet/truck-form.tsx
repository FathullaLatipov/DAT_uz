"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { CITIES } from "@/server/domain/geo";
import { BODY_TYPES, TRUCK_STATUSES, TRUCK_TYPES } from "@/server/domain/enums";
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
}

export function TruckForm({ id, initial, canDelete }: { id?: string; initial: TruckFormValues; canDelete?: boolean }) {
  const { t, label, city } = useI18n();
  const dialog = useDialog();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof TruckFormValues>(k: K, val: TruckFormValues[K]) => (setSaved(false), setV((s) => ({ ...s, [k]: val })));
  const num = (k: keyof TruckFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = { ...v, plate: v.plate || null, driverName: v.driverName || null };
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
          <Field label={t("fleet.fuelPrice")}><Input type="number" inputMode="decimal" step="0.01" value={v.fuelPriceUsd} onChange={num("fuelPriceUsd")} /></Field>
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
