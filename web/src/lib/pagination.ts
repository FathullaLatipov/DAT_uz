/** The page numbers a pager shows: the first and last page, the current one and its neighbours, with "…" where numbers are skipped. */
export function pageWindow(page: number, pages: number, around = 1): (number | "…")[] {
  if (pages <= 1) return [1];
  const keep = new Set<number>([1, pages]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pages) keep.add(p);
  // A one-page hole is cheaper to show as the number itself than as "…".
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = sorted[i - 1];
    if (prev != null && p - prev === 2) out.push(prev + 1);
    else if (prev != null && p - prev > 2) out.push("…");
    out.push(p);
  }
  return out;
}

/** "from–to of total" for a page of `size` rows. */
export function pageRange(page: number, size: number, total: number) {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  return { from, to: Math.min(total, page * size) };
}
