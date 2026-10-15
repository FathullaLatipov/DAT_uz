"use client";

import type { OfferWithRels } from "@/server/services/freight";
import { cn } from "@/lib/format";
import { LoadTile } from "./load-tile";
import { LoadDetailPanel } from "../loads/load-detail-panel";
import { useExpandableRow } from "../loads/use-expandable-row";

/** Mobile tap-to-expand list for the public catalog — same shared-expanded-id pattern as the
 * authenticated board's mobile card list and desktop tables. */
export function CatalogTileList({ items, className }: { items: OfferWithRels[]; className?: string }) {
  const { toggle, isOpen } = useExpandableRow();
  return (
    <div className={className}>
      {items.map((o) => {
        const open = isOpen(o.id);
        return (
          <div key={o.id} className={cn("min-w-0", open && "sm:col-span-2")}>
            <LoadTile o={o} expanded={open} onToggle={() => toggle(o.id)} />
            {open && (
              <div className="-mt-px overflow-hidden rounded-b-xl border border-t-0 border-border">
                <LoadDetailPanel offerId={o.id} context="catalog" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
