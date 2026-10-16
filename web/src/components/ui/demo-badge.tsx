"use client";

import { useI18n } from "@/i18n/client";
import { Badge } from "./primitives";

/** The "this is generated demo data" marker, in the visitor's language. Re-exported from primitives. */
export function DemoBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone="demo" className={className} title={t("common.demoDataTitle")}>
      {t("common.demoData")}
    </Badge>
  );
}
