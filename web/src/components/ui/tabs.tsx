"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface TabDef {
  key: string;
  label: ReactNode;
  badge?: ReactNode;
}

/**
 * Generic controlled tab nav — same visual language as the admin section's route-based tabs
 * (border-b underline, brand-colored active state), but client-driven for pages that switch
 * panels in place instead of navigating between routes.
 */
export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === active ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ active, id, children }: { active: boolean; id: string; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} className="animate-fade-up space-y-5">
      {children}
    </div>
  );
}
