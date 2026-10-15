"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One row expanded at a time, identified by its stable id (never a row index — indices shift
 * under sorting/pagination and would silently reattach the panel to the wrong load). Shared by
 * the authenticated board and the public catalog tables.
 *
 * Attach `containerRef` to the table's scrolling wrapper and `data-row-id={id}` to each summary
 * row: opening a row then scrolls it up under the sticky header, so the detail panel is seen from
 * its top instead of appearing half-hidden further down the list.
 */
export function useExpandableRow() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  useEffect(() => {
    const box = containerRef.current;
    if (!expandedId || !box) return;
    const row = box.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(expandedId)}"]`);
    if (!row) return;
    const headerH = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = box.scrollTop + (row.getBoundingClientRect().top - box.getBoundingClientRect().top) - headerH;
    // Only move when the row is not already comfortably in view at the top of the list.
    if (Math.abs(top - box.scrollTop) > 4) box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [expandedId]);

  return { expandedId, toggle, isOpen: (id: string) => expandedId === id, containerRef };
}
