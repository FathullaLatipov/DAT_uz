"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Handshake, Headset, Loader2, Plus, Truck, User, Users, X } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { BODY_TYPES, CARGO_TYPES, PAYMENT_TERMS } from "@/server/domain/enums";
import { useI18n } from "@/i18n/client";
import { Button, Card, Field, Input, Select } from "@/components/ui/primitives";

const ACCOUNT = [
  { v: "TRUCK_OWNER", icon: Truck },
  { v: "OWNER_OPERATOR", icon: User },
  { v: "FLEET_MANAGER", icon: Users },
  { v: "DISPATCHER", icon: Headset },
  { v: "LOGISTICS_COMPANY", icon: Building2 },
  { v: "BROKER", icon: Handshake },
] as const;

const UZ_CITIES = CITIES.filter((c) => c.country === "UZ");
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const PRESETS: Record<string, { capacityKg: number; volumeM3: number }> = {
  CURTAINSIDER: { capacityKg: 20000, volumeM3: 86 },
  REFRIGERATED: { capacityKg: 20000, volumeM3: 82 },
  BOX: { capacityKg: 10000, volumeM3: 45 },
  FLATBED: { capacityKg: 22000, volumeM3: 60 },
};

export function OnboardingWizard() {
  const { t, m, label, city, country } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeFromSignup = searchParams.get("type");
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<string>(ACCOUNT.some((a) => a.v === typeFromSignup) ? typeFromSignup! : "OWNER_OPERATOR");
  const [truck, setTruck] = useState({ truckType: "SEMI", bodyType: "CURTAINSIDER", capacityKg: 20000, volumeM3: 86, currentCityId: "tashkent", availableFrom: tomorrow() });
  const [routes, setRoutes] = useState<{ originCityId: string; destCityId: string }[]>([
    { originCityId: "tashkent", destCityId: "almaty" },
    { originCityId: "tashkent", destCityId: "moscow" },
  ]);
  const [prefs, setPrefs] = useState({ minRatePerKmUsd: "1.2", maxDeadheadKm: 150, preferredCargo: [] as string[], preferredCountries: ["KZ", "RU"] as string[], paymentTerms: [] as string[] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBroker = accountType === "BROKER";
  const skipTruck = accountType === "DISPATCHER" || isBroker;
  const steps = m.ob.steps;

  async function finish() {
    setPending(true);
    setError(null);
    try {
      await apiCall("/api/onboarding", "POST", {
        accountType,
        truck: skipTruck ? undefined : truck,
        routes,
        prefs: { ...prefs, minRatePerKmUsd: prefs.minRatePerKmUsd ? Number(prefs.minRatePerKmUsd) : null },
      });
      router.replace("/app?welcome=1");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div>
      <ol className="mb-8 flex items-center gap-2" aria-label={t("ob.progress")}>
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-brand text-brand-fg" : i === step ? "border-2 border-brand text-brand" : "bg-surface-3 text-subtle")}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:inline", i === step ? "font-medium" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <Card className="animate-fade-up p-5 sm:p-7" key={step}>
        {step === 0 && (
          <>
            <h1 className="text-xl font-semibold">{t("ob.whoTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("ob.whoSub")}</p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {ACCOUNT.map((a) => (
                <button
                  key={a.v}
                  type="button"
                  onClick={() => setAccountType(a.v)}
                  className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-left transition", accountType === a.v ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong")}
                  aria-pressed={accountType === a.v}
                >
                  <a.icon className={cn("mt-0.5 h-5 w-5", accountType === a.v ? "text-brand" : "text-muted")} />
                  <span>
                    <span className="block text-sm font-medium">{m.ob.accounts[a.v].t}</span>
                    <span className="block text-xs text-muted">{m.ob.accounts[a.v].d}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-xl font-semibold">{skipTruck ? t("ob.trucksLater") : t("ob.firstTruck")}</h1>
            {skipTruck ? (
              <p className="mt-2 text-sm text-muted">
                {isBroker ? t("ob.brokerNote") : t("ob.dispatcherNote")}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">{t("ob.basics")}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label={t("fleet.type")}>
                    <Select value={truck.truckType} onChange={(e) => setTruck({ ...truck, truckType: e.target.value })}>
                      {["SEMI", "RIGID", "VAN", "ROAD_TRAIN"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("fleet.body")}>
                    <Select value={truck.bodyType} onChange={(e) => setTruck({ ...truck, bodyType: e.target.value, ...(PRESETS[e.target.value] ?? {}) })}>
                      {BODY_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("fleet.capacity")}>
                    <Input type="number" inputMode="numeric" min={500} max={60000} step={500} value={truck.capacityKg} onChange={(e) => setTruck({ ...truck, capacityKg: Number(e.target.value) })} />
                  </Field>
                  <Field label={t("fleet.volume")}>
                    <Input type="number" inputMode="decimal" min={1} max={200} value={truck.volumeM3} onChange={(e) => setTruck({ ...truck, volumeM3: Number(e.target.value) })} />
                  </Field>
                  <Field label={t("fleet.location")}>
                    <Select value={truck.currentCityId} onChange={(e) => setTruck({ ...truck, currentCityId: e.target.value })}>
                      <optgroup label={country("UZ")}>{UZ_CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}</optgroup>
                      <optgroup label={t("ob.abroad")}>{CITIES.filter((c) => c.country !== "UZ").map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}</optgroup>
                    </Select>
                  </Field>
                  <div role="group" aria-label={t("fleet.availableFrom")}>
                    <span className="mb-1.5 block text-xs font-medium text-muted">{t("fleet.availableFrom")}</span>
                    <div className="flex gap-1.5">
                      {[[t("time.today"), today()], [t("time.tomorrow"), tomorrow()]].map(([l, v]) => (
                        <button key={l} type="button" onClick={() => setTruck({ ...truck, availableFrom: v })} className={cn("h-9 flex-1 rounded-lg border text-sm", truck.availableFrom === v ? "border-brand bg-brand-soft text-brand" : "border-border")}>
                          {l}
                        </button>
                      ))}
                      <Input type="date" aria-label={t("ob.pickDate")} className="flex-1" value={truck.availableFrom} onChange={(e) => setTruck({ ...truck, availableFrom: e.target.value })} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-semibold">{t("pf.routes")}</h1>
            <p className="mt-1 text-sm text-muted">{t("ob.routesSub")}</p>
            <div className="mt-5 space-y-2.5">
              {routes.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select aria-label={t("search.from")} value={r.originCityId} onChange={(e) => setRoutes(routes.map((x, j) => (j === i ? { ...x, originCityId: e.target.value } : x)))}>
                    {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
                  </Select>
                  <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />
                  <Select aria-label={t("search.to")} value={r.destCityId} onChange={(e) => setRoutes(routes.map((x, j) => (j === i ? { ...x, destCityId: e.target.value } : x)))}>
                    {CITIES.map((c) => <option key={c.id} value={c.id}>{city(c.id)}</option>)}
                  </Select>
                  <Button variant="ghost" size="icon" aria-label={t("pf.removeRoute")} onClick={() => setRoutes(routes.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {routes.length < 10 && (
                <Button variant="outline" size="sm" onClick={() => setRoutes([...routes, { originCityId: truck.currentCityId, destCityId: "bishkek" }])}>
                  <Plus className="h-4 w-4" /> {t("pf.addRoute")}
                </Button>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-xl font-semibold">{t("ob.prefsTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("ob.prefsSub")}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={t("pf.minRate")}>
                <Input type="number" inputMode="decimal" step="0.05" min={0} value={prefs.minRatePerKmUsd} onChange={(e) => setPrefs({ ...prefs, minRatePerKmUsd: e.target.value })} placeholder={t("ob.ratePlaceholder")} />
              </Field>
              <Field label={t("pf.maxDeadhead", { n: prefs.maxDeadheadKm })}>
                <input type="range" min={0} max={500} step={10} value={prefs.maxDeadheadKm} onChange={(e) => setPrefs({ ...prefs, maxDeadheadKm: Number(e.target.value) })} className="mt-2 w-full accent-[var(--brand)]" />
              </Field>
            </div>
            <Chips title={t("pf.cargo")} options={CARGO_TYPES.map((c) => [c, label(c)])} value={prefs.preferredCargo} onToggle={(v) => setPrefs({ ...prefs, preferredCargo: toggle(prefs.preferredCargo, v) })} />
            <Chips title={t("pf.countries")} options={COUNTRIES.map((c) => [c.code, country(c.code)])} value={prefs.preferredCountries} onToggle={(v) => setPrefs({ ...prefs, preferredCountries: toggle(prefs.preferredCountries, v) })} />
            <Chips title={t("ob.payment")} options={PAYMENT_TERMS.map((c) => [c, label(c)])} value={prefs.paymentTerms} onToggle={(v) => setPrefs({ ...prefs, paymentTerms: toggle(prefs.paymentTerms, v) })} />
          </>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}

        <div className="mt-7 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || pending}>
            <ArrowLeft className="h-4 w-4" /> {t("bk.back")}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>
              {t("ob.continue")} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {isBroker ? t("ob.startPosting") : t("ob.showBest")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Chips({ title, options, value, onToggle }: { title: string; options: [string, string][]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-xs font-medium text-muted">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onToggle(v)} aria-pressed={value.includes(v)} className={cn("rounded-full border px-2.5 py-1 text-xs transition", value.includes(v) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
