"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import { MapPinned } from "lucide-react";
import { Skeleton } from "../ui/primitives";
import { DeferUntilIdle } from "../ui/defer";

/** MapLibre is ~800 KB — loaded only on pages that show a map, never during SSR. */
const FreightMap = dynamic(() => import("./freight-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

/**
 * `onDemand`: the map loads only after a click — used on public pages where the map is
 * nice-to-have and shouldn't cost first-visit performance.
 */
export function LazyMap({ onDemand, ...props }: ComponentProps<typeof FreightMap> & { onDemand?: boolean }) {
  const [requested, setRequested] = useState(false);
  if (onDemand && !requested)
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className={`${props.className ?? ""} flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_40%,var(--brand-soft),transparent_60%),var(--surface-2)] text-sm text-muted transition hover:text-fg`}
      >
        <MapPinned className="h-6 w-6 text-brand" />
        Show route on map
      </button>
    );
  return (
    <DeferUntilIdle className={props.className} fallback={<Skeleton className="h-full w-full rounded-none" />}>
      <FreightMap {...props} className="h-full w-full" />
    </DeferUntilIdle>
  );
}

export type { MapPoint, MapRoute } from "./freight-map";
