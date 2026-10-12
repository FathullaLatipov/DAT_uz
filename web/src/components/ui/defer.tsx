"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "./primitives";

/**
 * Renders `children` only once the slot is near the viewport and the browser is idle.
 * Used for heavy client widgets (maps, charts) so they never block first paint.
 */
export function DeferUntilIdle({ children, className, fallback }: { children: ReactNode; className?: string; fallback?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 600);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        idle(() => !cancelled && setReady(true));
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {ready ? children : (fallback ?? <Skeleton className="h-full min-h-40 w-full" />)}
    </div>
  );
}
