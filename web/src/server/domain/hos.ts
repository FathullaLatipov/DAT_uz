/**
 * Trip time under driver-hours rules (AETR / EU 561 style): at most 9 hours of driving a day, a 45 minute break
 * after 4.5 hours, a daily rest, and a team of two driving up to twice as long a day. Planning arithmetic, so a
 * trip's arrival time reflects the driver, not just the distance.
 */

/** Average truck speed on Central Asian roads, km/h (≈ the 550 km/day the app has always planned with). */
export const AVG_SPEED_KMH = 61;
const DAY_H = 24;
const DRIVE_PER_DAY_SINGLE = 9;
const DRIVE_PER_DAY_TEAM = 18;
const BREAK_AFTER_H = 4.5;
const BREAK_H = 0.75;
const HANDOVER_H = 0.5;

export interface TimeSplit {
  /** hours at the wheel */
  drivingH: number;
  /** breaks and daily rest */
  restH: number;
  /** the whole elapsed time (driving + rest) */
  totalH: number;
}

/**
 * Elapsed time to cover `drivingH` hours of driving. One driver: 9 h a day, a break after each 4.5 h, then a night's
 * rest (planned as a full 24 h day). A team of two keeps the truck moving around the clock, swapping at the wheel.
 */
export function splitDriving(drivingH: number, crew: number = 1): TimeSplit {
  const d = Math.max(0, drivingH);
  if (d === 0) return { drivingH: 0, restH: 0, totalH: 0 };
  const perDay = crew >= 2 ? DRIVE_PER_DAY_TEAM : DRIVE_PER_DAY_SINGLE;
  const partial = (h: number) => (crew >= 2 ? h + HANDOVER_H : h + Math.floor((h - 1e-9) / BREAK_AFTER_H) * BREAK_H);
  // Complete driving days, then the last (possibly shorter) stretch.
  const fullDays = Math.floor((d - 1e-9) / perDay);
  const last = d - fullDays * perDay;
  const total = fullDays * DAY_H + partial(last);
  return { drivingH: d, restH: Math.round((total - d) * 100) / 100, totalH: Math.round(total * 100) / 100 };
}

export interface TripTime extends TimeSplit {
  borderH: number;
  /** driving + rest + typical border time */
  elapsedH: number;
  days: number;
}

/** Whole-trip time: driving hours (from a routed duration when known, else the distance), rest per the crew, and border time. */
export function tripTime(opts: { km: number; drivingMinutes?: number | null; crew?: number; borderH?: number }): TripTime {
  const drivingH = opts.drivingMinutes && opts.drivingMinutes > 0 ? opts.drivingMinutes / 60 : opts.km / AVG_SPEED_KMH;
  const s = splitDriving(drivingH, opts.crew ?? 1);
  const borderH = Math.max(0, opts.borderH ?? 0);
  const elapsedH = Math.round((s.totalH + borderH) * 100) / 100;
  return { ...s, borderH, elapsedH, days: Math.max(1, Math.ceil(elapsedH / DAY_H)) };
}
