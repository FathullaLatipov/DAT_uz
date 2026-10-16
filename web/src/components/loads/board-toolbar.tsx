"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BellPlus, Check, Columns2, List, Loader2, Map as MapIcon } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Button, Select } from "../ui/primitives";

const SORTS = ["score", "profit", "ratePerKm", "rate", "deadhead", "loading", "newest", "distance"] as const;
const VIEWS = [["list", List, "viewList"], ["split", Columns2, "viewSplit"], ["map", MapIcon, "viewMap"]] as const;

export function BoardToolbar({ total, view }: { total: number; view: string }) {
  const { t, tn } = useI18n();
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
    const name = window.prompt(t("board.savePrompt"), sp.get("nl") ?? t("board.defaultName"));
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
      <span className="num mr-auto text-sm text-muted">{tn("board.loadsCount", total)}</span>
      <Button variant="outline" size="sm" onClick={saveSearch} disabled={saving !== "idle"} aria-label={t("board.saveAria")}>
        {saving === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : saving === "saved" ? <Check className="h-4 w-4 text-pos" /> : <BellPlus className="h-4 w-4" />}
        <span className="hidden sm:inline">{saving === "saved" ? t("board.savedOn") : t("board.saveAlert")}</span>
      </Button>
      <label className="sr-only" htmlFor="sort">{t("board.sortBy")}</label>
      <Select id="sort" className="h-8 w-auto text-[13px]" value={sp.get("sort") ?? "score"} onChange={(e) => push("sort", e.target.value)}>
        {SORTS.map((k) => <option key={k} value={k}>{t(`board.sort.${k}`)}</option>)}
      </Select>
      <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label={t("board.view")}>
        {VIEWS.map(([k, Icon, l]) => (
          <button key={k} onClick={() => push("view", k)} aria-pressed={view === k} title={t(`board.${l}`)}
            className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-xs", view === k ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg", k === "split" && "hidden xl:flex")}>
            <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t(`board.${l}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
