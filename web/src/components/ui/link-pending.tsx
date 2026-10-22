"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/** Place inside a `<Link>`: shows a spinner while that link's navigation is in flight. */
export function LinkPending({ className = "h-3.5 w-3.5" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className={`${className} animate-spin`} aria-hidden /> : null;
}
