"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "../ui/primitives";
import { DeferUntilIdle } from "../ui/defer";

const fallback = () => <Skeleton className="h-44 w-full" />;
const P = dynamic(() => import("./charts").then((m) => m.ProfitBars), { ssr: false, loading: fallback });
const K = dynamic(() => import("./charts").then((m) => m.KmStack), { ssr: false, loading: fallback });
const R = dynamic(() => import("./charts").then((m) => m.RateTrend), { ssr: false, loading: fallback });

// Recharts is deferred until idle so it never competes with first paint.
export const ProfitBars = (p: ComponentProps<typeof P>) => <DeferUntilIdle fallback={fallback()}><P {...p} /></DeferUntilIdle>;
export const KmStack = (p: ComponentProps<typeof K>) => <DeferUntilIdle fallback={fallback()}><K {...p} /></DeferUntilIdle>;
export const RateTrend = (p: ComponentProps<typeof R>) => <DeferUntilIdle fallback={fallback()}><R {...p} /></DeferUntilIdle>;
