"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, MapPinned, Package, Wallet } from "lucide-react";
import { apiCall } from "@/lib/client";
import { CITIES, COUNTRIES, estimateRoadKm, estimateTransitDays } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, CURRENCIES, PAYMENT_TERMS } from "@/server/domain/enums";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Button, Field, Input, Select } from "../ui/primitives";

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function CitySelect({ onlyUz, ...props }: React.ComponentProps<typeof Select> & { onlyUz?: boolean }) {
  const { city, country } = useI18n();
  return (
    <Select {...props}>
      {COUNTRIES.filter((c) => !onlyUz || c.code === "UZ").map((c) => (
        <optgroup key={c.code} label={country(c.code)}>
          {CITIES.filter((x) => x.country === c.code).map((x) => <option key={x.id} value={x.id}>{city(x.id)}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function PostLoadForm({ defaultContact }: { defaultContact: string }) {
  const { t, tn, label, km } = useI18n();
  const router = useRouter();
  const [v, setV] = useState({
    haul: "DOMESTIC" as "DOMESTIC" | "INTERNATIONAL", originCityId: "tashkent", destCityId: "samarkand", loadingDate: tomorrow(), unloadingDate: "", cargoType: "GENERAL", weightKg: "20000",
    volumeM3: "", cargoLengthM: "", cargoWidthM: "", cargoHeightM: "", oversize: false, adrClass: "", bodyType: "CURTAINSIDER", rate: "", currency: "USD", paymentTerms: "ON_UNLOADING", contactName: defaultContact, contactPhone: "", contactEmail: "", requirements: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countryOf = (id: string) => CITIES.find((c) => c.id === id)?.country;
  /** Switching the type of haul keeps the cities that still fit it and replaces the ones that do not. */
  function chooseHaul(haul: "DOMESTIC" | "INTERNATIONAL") {
    setV((s) => {
      if (haul === "DOMESTIC") {
        return { ...s, haul, originCityId: countryOf(s.originCityId) === "UZ" ? s.originCityId : "tashkent", destCityId: countryOf(s.destCityId) === "UZ" && s.destCityId !== (countryOf(s.originCityId) === "UZ" ? s.originCityId : "tashkent") ? s.destCityId : "samarkand" };
      }
      return { ...s, haul, destCityId: countryOf(s.originCityId) === countryOf(s.destCityId) ? "almaty" : s.destCityId };
    });
  }
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const size = (k: "cargoLengthM" | "cargoWidthM" | "cargoHeightM", label: string) => (
    <Field label={label}><Input type="number" inputMode="decimal" min={0.1} max={30} step="0.05" value={v[k]} onChange={set(k)} /></Field>
  );
  const distance = useMemo(() => estimateRoadKm(v.originCityId, v.destCityId), [v.originCityId, v.destCityId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await apiCall<{ id: string }>("/api/loads", "POST", {
        ...v,
        weightKg: Number(v.weightKg),
        volumeM3: v.volumeM3 ? Number(v.volumeM3) : null,
        cargoLengthM: v.cargoLengthM ? Number(v.cargoLengthM) : null,
        cargoWidthM: v.cargoWidthM ? Number(v.cargoWidthM) : null,
        cargoHeightM: v.cargoHeightM ? Number(v.cargoHeightM) : null,
        adrClass: v.adrClass || null,
        rate: v.rate ? Number(v.rate) : null,
        unloadingDate: v.unloadingDate || null,
      });
      router.push(`/app/loads/${r.id}?posted=1`);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section>
        <SectionHeader step={1} icon={<MapPinned className="h-4 w-4" />} title={t("post.stepRoute")} />
        <div className="mb-4">
          <div className="text-xs font-medium text-muted">{t("post.haulType")}</div>
          <div role="radiogroup" aria-label={t("post.haulType")} className="mt-1 inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {(["DOMESTIC", "INTERNATIONAL"] as const).map((h) => (
              <button key={h} type="button" role="radio" aria-checked={v.haul === h} onClick={() => chooseHaul(h)}
                className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", v.haul === h ? "bg-brand text-white" : "text-muted hover:text-fg")}>
                {h === "DOMESTIC" ? t("post.haulUz") : t("post.haulIntl")}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{v.haul === "DOMESTIC" ? t("post.haulUzHint") : t("post.haulIntlHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("post.from")}><CitySelect onlyUz={v.haul === "DOMESTIC"} value={v.originCityId} onChange={set("originCityId")} /></Field>
          <Field label={t("post.to")}><CitySelect onlyUz={v.haul === "DOMESTIC"} value={v.destCityId} onChange={set("destCityId")} /></Field>
          <Field label={t("post.loadingDate")}><Input type="date" required value={v.loadingDate} min={new Date().toISOString().slice(0, 10)} onChange={set("loadingDate")} /></Field>
          <Field label={t("post.unloadingDate")}><Input type="date" value={v.unloadingDate} onChange={set("unloadingDate")} /></Field>
        </div>
        {distance > 0 && (
          <p className="num mt-3 text-xs text-muted">{t("post.distanceLine", { km: km(distance), days: tn("route.days", estimateTransitDays(distance)) })}</p>
        )}
      </section>
      <section className="border-t border-border pt-6">
        <SectionHeader step={2} icon={<Package className="h-4 w-4" />} title={t("post.stepCargo")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("post.cargo")}><Select value={v.cargoType} onChange={set("cargoType")}>{CARGO_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label={t("post.weight")}><Input type="number" inputMode="numeric" required min={100} max={44000} step={100} value={v.weightKg} onChange={set("weightKg")} /></Field>
          <Field label={t("post.volume")}><Input type="number" inputMode="decimal" min={0} max={200} value={v.volumeM3} onChange={set("volumeM3")} /></Field>
          <Field label={t("post.truckBody")}><Select value={v.bodyType} onChange={set("bodyType")}>{BODY_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label={t("post.requirements")} className="sm:col-span-2 lg:col-span-4" hint={t("post.requirementsHint")}>
            <Input value={v.requirements} onChange={set("requirements")} maxLength={300} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="mb-1 text-xs text-muted">{t("post.sizeHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {size("cargoLengthM", t("post.sizeL"))}
              {size("cargoWidthM", t("post.sizeW"))}
              {size("cargoHeightM", t("post.sizeH"))}
              <Field label={t("post.adrClass")}>
                <Select value={v.adrClass} onChange={set("adrClass")}>
                  <option value="">{t("post.adrNone")}</option>
                  <option value="0">{t("post.adrUnknown")}</option>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => <option key={n} value={n}>{t("post.adrOption", { n })}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.oversize} onChange={(e) => setV({ ...v, oversize: e.target.checked })} className="h-4 w-4" /> {t("post.oversize")}
              </label>
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-border pt-6">
        <SectionHeader step={3} icon={<Wallet className="h-4 w-4" />} title={t("post.stepPrice")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label={t("post.rate")}><Input type="number" inputMode="decimal" min={0} value={v.rate} onChange={set("rate")} /></Field>
            <Field label={t("toolbar.currency")}><Select value={v.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <Field label={t("load.payment")}><Select value={v.paymentTerms} onChange={set("paymentTerms")}>{PAYMENT_TERMS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label={t("post.contact")}><Input required minLength={2} value={v.contactName} onChange={set("contactName")} autoComplete="name" /></Field>
          <Field label={t("post.phone")} hint={t("post.phoneHint")}><Input required type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={v.contactPhone} onChange={set("contactPhone")} autoComplete="tel" /></Field>
          <Field label={t("post.email")} hint={t("post.emailHint")}><Input type="email" inputMode="email" placeholder="name@company.com" value={v.contactEmail} onChange={set("contactEmail")} autoComplete="email" /></Field>
        </div>
      </section>
      {error && <p role="alert" className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" size="lg" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t("post.publish")}</Button>
        <p className="text-xs text-muted">{t("post.confirm")}</p>
      </div>
    </form>
  );
}

function SectionHeader({ step, icon, title }: { step: number; icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</span>
      <h2 className="text-sm font-semibold">
        <span className="text-subtle">{step}.</span> {title}
      </h2>
    </div>
  );
}
