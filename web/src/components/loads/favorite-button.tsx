"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { apiCall } from "@/lib/client";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/format";
import { buttonClass } from "../ui/primitives";

export function FavoriteButton({ offerId, initial, withLabel }: { offerId: string; initial: boolean; withLabel?: boolean }) {
  const { t } = useI18n();
  const [fav, setFav] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !fav;
    setFav(next);
    start(async () => {
      try {
        await apiCall("/api/favorites", next ? "POST" : "DELETE", { offerId });
      } catch {
        setFav(!next);
      }
    });
  };
  return (
    <button onClick={toggle} disabled={pending} aria-pressed={fav} aria-label={fav ? t("board.unsaveLoad") : t("board.saveLoad")} className={buttonClass(withLabel ? "outline" : "ghost", withLabel ? "md" : "icon", cn(fav && "text-accent"))}>
      <Star className={cn("h-4 w-4", fav && "fill-current")} />
      {withLabel && (fav ? t("board.saved") : t("board.save"))}
    </button>
  );
}
