"use client";

import type { LoadRow } from "@/server/services/freight";
import { LoadCard } from "./parts";
import { LoadDetailPanel } from "./load-detail-panel";
import { useExpandableRow } from "./use-expandable-row";

/** Mobile/split-view card list with the same tap-to-expand behavior as the desktop table —
 * one shared expanded id for the whole list, so opening a card closes any other. */
export function LoadCardList({ rows, className }: { rows: LoadRow[]; className?: string }) {
  const { toggle, isOpen } = useExpandableRow();
  return (
    <div className={className}>
      {rows.map((r) => {
        const open = isOpen(r.offer.id);
        return (
          <div key={r.offer.id} className="min-w-0">
            <LoadCard row={r} expanded={open} onToggle={() => toggle(r.offer.id)} />
            {open && (
              <div className="-mt-px overflow-hidden rounded-b-xl border border-t-0 border-border">
                <LoadDetailPanel offerId={r.offer.id} context="board" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
