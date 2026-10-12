"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { apiCall } from "@/lib/client";
import { cn } from "@/lib/format";
import { buttonClass } from "../ui/primitives";

export function FavoriteButton({ offerId, initial, withLabel }: { offerId: string; initial: boolean; withLabel?: boolean }) {
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
    <button onClick={toggle} disabled={pending} aria-pressed={fav} aria-label={fav ? "Remove from saved" : "Save load"} className={buttonClass(withLabel ? "outline" : "ghost", withLabel ? "md" : "icon", cn(fav && "text-accent"))}>
      <Star className={cn("h-4 w-4", fav && "fill-current")} />
      {withLabel && (fav ? "Saved" : "Save")}
    </button>
  );
}
