/**
 * Pure date helpers over ISO 'YYYY-MM-DD' strings.
 *
 * CONTRACT (Phase 0 stub — implemented in Phase A; signatures are frozen):
 * - No Date objects escape this module; todayInAppTz is the ONLY function
 *   that touches Date/Intl.
 * - All functions are pure and total over valid ISODate inputs.
 */
import type { ISODate } from "./types";
import { APP_TZ } from "./constants";

// ---------------------------------------------------------------------------
// Internal helpers — pure integer math on {y,m,d} triples / epoch-day counts.
// (No Date objects; the proleptic-Gregorian conversions below are Howard
// Hinnant's days_from_civil / civil_from_days algorithms.)
// ---------------------------------------------------------------------------

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: ISODate): Ymd {
  return {
    y: Number(iso.slice(0, 4)),
    m: Number(iso.slice(5, 7)),
    d: Number(iso.slice(8, 10)),
  };
}

function fmt(y: number, m: number, d: number): ISODate {
  const yy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

/** Days since 1970-01-01 for the given civil date (proleptic Gregorian). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil. */
function civilFromDays(z: number): Ymd {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Today's calendar date in APP_TZ (constants.APP_TZ). `now` injectable for tests. */
export function todayInAppTz(now?: Date): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now ?? new Date());
  let y = "0000";
  let m = "01";
  let d = "01";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y}-${m}-${d}`;
}

/** d + n days (n may be negative). */
export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parse(d);
  const { y: ny, m: nm, d: nd } = civilFromDays(daysFromCivil(y, m, day) + n);
  return fmt(ny, nm, nd);
}

/**
 * d + n months, anchored to d's ORIGINAL day-of-month with end-of-month
 * clamping that never propagates: addMonthsClamped('2026-01-31', 1) ===
 * '2026-02-28', addMonthsClamped('2026-01-31', 2) === '2026-03-31'.
 */
export function addMonthsClamped(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parse(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(day, daysInMonth(ny, nm));
  return fmt(ny, nm, nd);
}

/** b - a in whole days (positive when b is after a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parse(a);
  const pb = parse(b);
  return daysFromCivil(pb.y, pb.m, pb.d) - daysFromCivil(pa.y, pa.m, pa.d);
}

/** Standard comparator: negative when a < b, 0 when equal, positive when a > b. */
export function cmpDate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
