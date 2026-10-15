"use client";

import { useState } from "react";

/**
 * One row expanded at a time, identified by its stable id (never a row index — indices shift
 * under sorting/pagination and would silently reattach the panel to the wrong load). Shared by
 * the authenticated board and the public catalog tables.
 */
export function useExpandableRow() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));
  return { expandedId, toggle, isOpen: (id: string) => expandedId === id };
}
