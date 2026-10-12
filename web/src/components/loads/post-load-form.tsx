"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS, label } from "@/server/domain/enums";
import { Button, Field, Input, Select } from "../ui/primitives";

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function CitySelect(props: React.ComponentProps<typeof Select>) {
  return (
    <Select {...props}>
      {COUNTRIES.map((c) => (
        <optgroup key={c.code} label={c.name}>
          {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function PostLoadForm({ defaultContact }: { defaultContact: string }) {
  const router = useRouter();
  const [v, setV] = useState({
    originCityId: "tashkent", destCityId: "almaty", loadingDate: tomorrow(), unloadingDate: "", cargoType: "GENERAL", weightKg: "20000",
    volumeM3: "", bodyType: "CURTAINSIDER", rate: "", currency: "USD", paymentTerms: "ON_UNLOADING", contactName: defaultContact, contactPhone: "", requirements: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await apiCall<{ id: string }>("/api/loads", "POST", {
        ...v,
        weightKg: Number(v.weightKg),
        volumeM3: v.volumeM3 ? Number(v.volumeM3) : null,
        rate: v.rate ? Number(v.rate) : null,
        unloadingDate: v.unloadingDate || null,
      });
      router.push(`/load/${r.id}?posted=1`);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Route & dates</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From"><CitySelect value={v.originCityId} onChange={set("originCityId")} /></Field>
          <Field label="To"><CitySelect value={v.destCityId} onChange={set("destCityId")} /></Field>
          <Field label="Loading date"><Input type="date" required value={v.loadingDate} min={new Date().toISOString().slice(0, 10)} onChange={set("loadingDate")} /></Field>
          <Field label="Unloading date (optional)"><Input type="date" value={v.unloadingDate} onChange={set("unloadingDate")} /></Field>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Cargo & truck</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cargo"><Select value={v.cargoType} onChange={set("cargoType")}>{CARGO_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Weight (kg)"><Input type="number" inputMode="numeric" required min={100} max={44000} step={100} value={v.weightKg} onChange={set("weightKg")} /></Field>
          <Field label="Volume (m³, optional)"><Input type="number" inputMode="decimal" min={0} max={200} value={v.volumeM3} onChange={set("volumeM3")} /></Field>
          <Field label="Truck body"><Select value={v.bodyType} onChange={set("bodyType")}>{BODY_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Requirements (optional)" className="sm:col-span-2 lg:col-span-4" hint="Comma-separated, e.g. ADR, temperature +2…+6 °C, TIR">
            <Input value={v.requirements} onChange={set("requirements")} maxLength={300} />
          </Field>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Price & contact</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Rate (empty = negotiable)"><Input type="number" inputMode="decimal" min={0} value={v.rate} onChange={set("rate")} /></Field>
            <Field label="Currency"><Select value={v.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <Field label="Payment"><Select value={v.paymentTerms} onChange={set("paymentTerms")}>{PAYMENT_TERMS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Contact person"><Input required minLength={2} value={v.contactName} onChange={set("contactName")} autoComplete="name" /></Field>
          <Field label="Phone" hint="Shown only to signed-in carriers"><Input required type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={v.contactPhone} onChange={set("contactPhone")} autoComplete="tel" /></Field>
        </div>
      </section>
      {error && <p role="alert" className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Publish load</Button>
        <p className="text-xs text-muted">By publishing you confirm the load is real and you are authorised to offer it.</p>
      </div>
    </form>
  );
}
