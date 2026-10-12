"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Phone } from "lucide-react";
import { apiCall } from "@/lib/client";
import { Button, Select } from "../ui/primitives";

export function AssignPanel({ offerId, trucks, defaultTruckId, canAssign }: { offerId: string; trucks: { id: string; label: string; eligible: boolean }[]; defaultTruckId?: string; canAssign: boolean }) {
  const router = useRouter();
  const eligible = trucks.filter((t) => t.eligible);
  const [truckId, setTruckId] = useState(defaultTruckId && eligible.some((t) => t.id === defaultTruckId) ? defaultTruckId : (eligible[0]?.id ?? ""));
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setState("pending");
    setError(null);
    try {
      const r = await apiCall<{ redirect: string }>(`/api/loads/${offerId}/assign`, "POST", { truckId });
      setState("done");
      router.push(r.redirect);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  if (!canAssign) return <p className="text-sm text-muted">Your role can view loads but not assign them to trucks.</p>;
  if (!eligible.length) return <p className="text-sm text-muted">None of your trucks can take this load (see blockers above).</p>;

  return (
    <div className="space-y-3">
      <Select aria-label="Truck" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
        {eligible.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </Select>
      <Button className="w-full" onClick={assign} disabled={state !== "idle" || !truckId}>
        {state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "done" ? <Check className="h-4 w-4" /> : null}
        Assign load & find return load
      </Button>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Phone className="mt-0.5 h-3 w-3 shrink-0" />
        Confirm with the broker through the original listing before dispatching. Assigning records the trip in your fleet and starts the backhaul search.
      </p>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
    </div>
  );
}
