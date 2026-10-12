"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { Button } from "../ui/primitives";

const LABEL: Record<string, string> = { WEB: "In-app", EMAIL: "Email", TELEGRAM: "Telegram" };

export function SavedSearchControls({ id, channels, available }: { id: string; channels: string[]; available: { channel: string; configured: boolean }[] }) {
  const router = useRouter();
  const [on, setOn] = useState(channels);
  async function toggle(c: string) {
    const next = on.includes(c) ? on.filter((x) => x !== c) : [...on, c];
    setOn(next);
    await apiCall(`/api/saved-searches/${id}`, "PATCH", { channels: next }).catch(() => setOn(on));
  }
  async function remove() {
    await apiCall(`/api/saved-searches/${id}`, "DELETE");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {available.map((a) => (
        <button
          key={a.channel}
          onClick={() => toggle(a.channel)}
          aria-pressed={on.includes(a.channel)}
          title={a.configured ? undefined : `${LABEL[a.channel]} delivery is not configured on this server yet — alerts will appear in-app`}
          className={cn("rounded-full border px-2.5 py-1 text-xs", on.includes(a.channel) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted", !a.configured && "border-dashed")}
        >
          {LABEL[a.channel]}{!a.configured && " (soon)"}
        </button>
      ))}
      <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete saved search"><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
