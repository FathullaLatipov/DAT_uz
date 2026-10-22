"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar at the top of the window while a page change is loading: it starts on a click on an in-app link
 * and finishes when the address changes (or after a safety timeout). Gives instant feedback while the server
 * renders the next page.
 */
export function RouteProgress() {
  const path = usePathname();
  const sp = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `${path}?${sp.toString()}`;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (safety.current) clearTimeout(safety.current);
    timer.current = safety.current = null;
  };

  // The address changed: the page arrived, so finish and fade out.
  useEffect(() => {
    if (!timer.current) return;
    stop();
    setWidth(100);
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    const start = () => {
      stop();
      setVisible(true);
      setWidth(8);
      // Creeps towards 90% and waits there for the page.
      timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w)), 200);
      safety.current = setTimeout(() => {
        stop();
        setVisible(false);
        setWidth(0);
      }, 15000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      stop();
    };
  }, []);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full rounded-r-full bg-brand shadow-[0_0_8px_var(--brand)] transition-[width] duration-200 ease-out" style={{ width: `${width}%` }} />
    </div>
  );
}
