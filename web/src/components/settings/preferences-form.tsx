"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Plus, X } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { CITIES, COUNTRIES } from "@/server/domain/geo";
import { CARGO_TYPES, PAYMENT_TERMS, label } from "@/server/domain/enums";
import { Button, Field, Input, Select } from "../ui/primitives";

export interface Prefs {
  minRatePerKmUsd: string;
  maxDeadheadKm: number;
  preferredCargo: string[];
  preferredCountries: string[];
  paymentTerms: string[];
  routes: { originCityId: string; destCityId: string }[];
}

export function PreferencesForm({ initial, readOnly }: { initial: Prefs; readOnly: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: "preferredCargo" | "preferredCountries" | "paymentTerms", v: string) =>
    setP({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] });

  async function save() {
    setState("saving");
    setError(null);
    try {
      await apiCall("/api/settings", "PATCH", { ...p, minRatePerKmUsd: p.minRatePerKmUsd ? Number(p.minRatePerKmUsd) : null });
      setState("saved");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  return (
    <fieldset disabled={readOnly} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum rate ($/km)" hint="Loads below this are ranked lower and flagged.">
          <Input type="number" step="0.05" min={0} value={p.minRatePerKmUsd} onChange={(e) => setP({ ...p, minRatePerKmUsd: e.target.value })} />
        </Field>
        <Field label={`Maximum deadhead: ${p.maxDeadheadKm} km`} hint="Empty driving to pickup you're willing to accept.">
          <input type="range" min={0} max={600} step={10} value={p.maxDeadheadKm} onChange={(e) => setP({ ...p, maxDeadheadKm: Number(e.target.value) })} className="mt-2 w-full accent-[var(--brand)]" />
        </Field>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-muted">Preferred routes</div>
        <div className="space-y-2">
          {p.routes.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select aria-label="From" value={r.originCityId} onChange={(e) => setP({ ...p, routes: p.routes.map((x, j) => (j === i ? { ...x, originCityId: e.target.value } : x)) })}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />
              <Select aria-label="To" value={r.destCityId} onChange={(e) => setP({ ...p, routes: p.routes.map((x, j) => (j === i ? { ...x, destCityId: e.target.value } : x)) })}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button variant="ghost" size="icon" aria-label="Remove route" onClick={() => setP({ ...p, routes: p.routes.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setP({ ...p, routes: [...p.routes, { originCityId: "tashkent", destCityId: "almaty" }] })}><Plus className="h-4 w-4" /> Add route</Button>
        </div>
      </div>
      <ChipRow title="Preferred cargo" opts={CARGO_TYPES.map((c) => [c, label(c)])} value={p.preferredCargo} onToggle={(v) => toggle("preferredCargo", v)} />
      <ChipRow title="Preferred countries" opts={COUNTRIES.map((c) => [c.code, c.name])} value={p.preferredCountries} onToggle={(v) => toggle("preferredCountries", v)} />
      <ChipRow title="Payment terms" opts={PAYMENT_TERMS.map((c) => [c, label(c)])} value={p.paymentTerms} onToggle={(v) => toggle("paymentTerms", v)} />
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={state === "saving"}>{state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}Save preferences</Button>
          {state === "saved" && <span className="text-sm text-pos">Saved — recommendations updated</span>}
        </div>
      )}
    </fieldset>
  );
}

function ChipRow({ title, opts, value, onToggle }: { title: string; opts: [string, string][]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={value.includes(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", value.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-fg")}>{l}</button>
        ))}
      </div>
    </div>
  );
}
