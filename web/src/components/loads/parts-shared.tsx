"use client";

import { ArrowRight, BadgeCheck, Clock, Layers, ShieldAlert } from "lucide-react";
import { getCity } from "@/server/domain/geo";
import { useI18n } from "@/i18n/client";
import { cn, isStale } from "@/lib/format";
import { Badge, DemoBadge } from "../ui/primitives";

/**
 * Small display pieces used by both server and client components. They are client components so
 * they can read the visitor's language from context — a server component can render them, and so
 * can the interactive tables. Re-exported from parts.tsx, which most pages import from.
 */

export function RouteLabel({ origin, dest, size = "md", className }: { origin: string; dest: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const { city } = useI18n();
  const o = getCity(origin);
  const d = getCity(dest);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-semibold", size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-[15px]", className)}>
      <CountryTag code={o?.country} />
      <span className="truncate">{city(origin)}</span>
      <ArrowRight className={cn("shrink-0 text-subtle", size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5")} />
      <CountryTag code={d?.country} />
      <span className="truncate">{city(dest)}</span>
    </span>
  );
}

/** Country code chip. Emoji flags render as bare letters on Windows, so we use a consistent tag. */
export function CountryTag({ code }: { code?: string }) {
  const { country } = useI18n();
  if (!code) return null;
  return (
    <span title={country(code)} className="shrink-0 rounded border border-border bg-surface-2 px-1 py-px font-mono text-xs font-medium leading-none text-muted">
      {code}
    </span>
  );
}

export function QualityBadge({ quality, flags }: { quality: string; flags?: string[] }) {
  const { t } = useI18n();
  const relevant = (flags ?? []).filter((f) => f !== "EXPIRED");
  if (quality === "VERIFIED")
    return (
      <Badge tone="pos" title={t("parts.verifiedTitle")}>
        <BadgeCheck className="h-3 w-3" /> {t("parts.verified")}
      </Badge>
    );
  if (quality === "UNVERIFIED")
    return (
      <Badge tone="neg" title={relevant.join(", ")}>
        <ShieldAlert className="h-3 w-3" /> {t("parts.unverified")}
      </Badge>
    );
  return <Badge tone="warn" title={relevant.join(", ") || t("parts.brokerNotVerified")}>{t("parts.partial")}</Badge>;
}

export function Freshness({ lastSeen }: { lastSeen: Date | string }) {
  const { t, ago } = useI18n();
  const stale = isStale(lastSeen);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", stale ? "text-warn" : "text-subtle")} title={t("parts.lastConfirmed", { ago: ago(lastSeen) })}>
      <Clock className="h-3 w-3" />
      {stale ? t("parts.possiblyOutdated") : t("parts.updated", { ago: ago(lastSeen) })}
    </span>
  );
}

export function Sources({ sources, demo }: { sources: { id: string; name: string }[]; demo?: boolean }) {
  const { t, tn } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sources.length > 1 && (
        <Badge tone="info" title={t("parts.sourcesMerged", { n: sources.length })}>
          <Layers className="h-3 w-3" /> {tn("parts.sources", sources.length)}
        </Badge>
      )}
      {sources.length === 1 && <Badge>{sources[0].name}</Badge>}
      {demo && <DemoBadge />}
    </span>
  );
}
