"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BellPlus, Check, Columns2, List, Loader2, Map as MapIcon } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { Button, Select } from "../ui/primitives";

const SORTS = [
  ["score", "Best match"],
  ["profit", "Est. profit"],
  ["ratePerKm", "Rate / km"],
  ["rate", "Total rate"],
  ["deadhead", "Lowest deadhead"],
  ["loading", "Loading date"],
  ["newest", "Newest"],
  ["distance", "Shortest"],
] as const;

export function BoardToolbar({ total, view }: { total: number; view: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  const push = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set(k, v);
    p.delete("page");
    router.push(`${path}?${p.toString()}`);
  };

  async function saveSearch() {
    const name = window.prompt("Name this search (you'll get alerts for new matching loads):", sp.get("nl") ?? "My search");
    if (!name) return;
    setSaving("saving");
    try {
      await apiCall("/api/saved-searches", "POST", { name, query: sp.toString() });
      setSaving("saved");
    } catch (e) {
      alert((e as Error).message);
      setSaving("idle");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="num mr-auto text-sm text-muted">{total.toLocaleString("en-US")} loads</span>
      <Button variant="outline" size="sm" onClick={saveSearch} disabled={saving !== "idle"} aria-label="Save search and get alerts">
        {saving === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : saving === "saved" ? <Check className="h-4 w-4 text-pos" /> : <BellPlus className="h-4 w-4" />}
        <span className="hidden sm:inline">{saving === "saved" ? "Saved — alerts on" : "Save & alert"}</span>
      </Button>
      <label className="sr-only" htmlFor="sort">Sort by</label>
      <Select id="sort" className="h-8 w-auto text-[13px]" value={sp.get("sort") ?? "score"} onChange={(e) => push("sort", e.target.value)}>
        {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
      <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View">
        {[
          ["list", List, "List"],
          ["split", Columns2, "Split"],
          ["map", MapIcon, "Map"],
        ].map(([k, Icon, l]) => {
          const I = Icon as typeof List;
          return (
            <button key={k as string} onClick={() => push("view", k as string)} aria-pressed={view === k} title={l as string}
              className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-xs", view === k ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg", k === "split" && "hidden xl:flex")}>
              <I className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{l as string}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
