/**
 * Pure date helpers over ISO 'YYYY-MM-DD' strings.
 *
 * CONTRACT (Phase 0 stub — implemented in Phase A; signatures are frozen):
 * - No Date objects escape this module; todayInAppTz is the ONLY function
 *   that touches Date/Intl.
 * - All functions are pure and total over valid ISODate inputs.
 */
import type { ISODate } from "./types";

/** Today's calendar date in APP_TZ (constants.APP_TZ). `now` injectable for tests. */
export function todayInAppTz(now?: Date): ISODate {
  void now;
  throw new Error("unimplemented (Phase A)");
}

/** d + n days (n may be negative). */
export function addDays(d: ISODate, n: number): ISODate {
  void d, n;
  throw new Error("unimplemented (Phase A)");
}

/**
 * d + n months, anchored to d's ORIGINAL day-of-month with end-of-month
 * clamping that never propagates: addMonthsClamped('2026-01-31', 1) ===
 * '2026-02-28', addMonthsClamped('2026-01-31', 2) === '2026-03-31'.
 */
export function addMonthsClamped(d: ISODate, n: number): ISODate {
  void d, n;
  throw new Error("unimplemented (Phase A)");
}

/** b - a in whole days (positive when b is after a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  void a, b;
  throw new Error("unimplemented (Phase A)");
}

/** Standard comparator: negative when a < b, 0 when equal, positive when a > b. */
export function cmpDate(a: ISODate, b: ISODate): number {
  void a, b;
  throw new Error("unimplemented (Phase A)");
}
