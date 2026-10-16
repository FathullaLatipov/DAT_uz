"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { Button } from "../ui/primitives";

const LABEL_KEY = { WEB: "channelWeb", EMAIL: "channelEmail", TELEGRAM: "channelTelegram" } as const;

export function SavedSearchControls({ id, channels, available }: { id: string; channels: string[]; available: { channel: string; configured: boolean; needsLink?: boolean }[] }) {
  const router = useRouter();
  const { t } = useI18n();
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
          onClick={() => (a.needsLink ? router.push("/app/settings") : toggle(a.channel))}
          aria-pressed={on.includes(a.channel)}
          title={a.needsLink ? t("board.channelTgLinkTitle") : a.configured ? undefined : t("board.channelSoonTitle", { channel: t(`board.${LABEL_KEY[a.channel as keyof typeof LABEL_KEY]}`) })}
          className={cn("rounded-full border px-2.5 py-1 text-xs", on.includes(a.channel) ? "border-brand bg-brand-soft text-brand" : "border-border text-muted", (!a.configured || a.needsLink) && "border-dashed")}
        >
          {t(`board.${LABEL_KEY[a.channel as keyof typeof LABEL_KEY]}`)}{!a.configured && !a.needsLink && ` ${t("board.soon")}`}
        </button>
      ))}
      <Button variant="ghost" size="icon" onClick={remove} aria-label={t("board.deleteSaved")}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
