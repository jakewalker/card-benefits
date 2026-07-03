/**
 * Cycle-window math — the heart of the app.
 *
 * CONTRACT (Phase 0 stub — implemented in Phase A; signatures are frozen).
 * Pure functions only: no I/O, no Date (use dates.ts helpers).
 *
 * SEMANTICS
 * =========
 * Windows are [start, end] with INCLUSIVE end (end = day before next start).
 *
 * Calendar anchor:
 *   monthly    → calendar month
 *   quarterly  → Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec
 *   semiannual → Jan–Jun (H1), Jul–Dec (H2)
 *   annual     → calendar year
 *
 * Anniversary anchor (based on the card's anniversaryDate month/day; the year
 * component of anniversaryDate is irrelevant to window math):
 *   annual     → anniversary occurrence to day-before-next (Feb 15 → Feb 14).
 *   semiannual → two 6-month blocks per anniversary year.
 *   quarterly  → four 3-month blocks per anniversary year.
 *   monthly    → month blocks starting on the anniversary day.
 *   Boundaries are addMonthsClamped(anniversaryOccurrence, k) — clamped from
 *   the ORIGINAL day-of-month (Jan 31 anchor → Feb 28 → Mar 31; a Feb 29
 *   anniversary falls on Feb 28 in non-leap years).
 *
 * CANONICAL cycle_key
 * ===================
 *   calendar monthly    → '2026-07'
 *   calendar quarterly  → '2026-Q3'
 *   calendar semiannual → '2026-H2'
 *   calendar annual     → '2026'
 *   anniversary (any)   → 'A' + ISO start date of the window, e.g. 'A2026-02-15'
 * Keys are unique per benefit and lexically sortable within a benefit.
 */
import type { Benefit, Card, CycleWindow, Frequency, ISODate } from "./types";

/** Minimal structural inputs so tests don't need full entities. */
export type CycleBenefit = Pick<Benefit, "frequency" | "anchor" | "startDate">;
export type CycleCard = Pick<Card, "anniversaryDate">;

/** The window (per semantics above) containing `date`. */
export function cycleForDate(
  benefit: CycleBenefit,
  card: CycleCard,
  date: ISODate,
): CycleWindow {
  void benefit, card, date;
  throw new Error("unimplemented (Phase A)");
}

/** cycleForDate(benefit, card, today). */
export function currentCycle(
  benefit: CycleBenefit,
  card: CycleCard,
  today: ISODate,
): CycleWindow {
  void benefit, card, today;
  throw new Error("unimplemented (Phase A)");
}

/**
 * Past windows, NEWEST FIRST, excluding the current window. Enumeration stops
 * before windows that end before benefit.startDate; the window CONTAINING
 * startDate is included (mid-cycle add). Returns at most `limit` windows.
 */
export function previousCycles(
  benefit: CycleBenefit,
  card: CycleCard,
  today: ISODate,
  limit: number,
): CycleWindow[] {
  void benefit, card, today, limit;
  throw new Error("unimplemented (Phase A)");
}

/**
 * Resolve a client-supplied key to its window, or null when the key is not a
 * valid key for this benefit's anchor/frequency (bad format, or an anniversary
 * key whose start date is not an actual cycle boundary).
 */
export function cycleWindowForKey(
  benefit: CycleBenefit,
  card: CycleCard,
  key: string,
): CycleWindow | null {
  void benefit, card, key;
  throw new Error("unimplemented (Phase A)");
}

/** window.end - today in days. 0 = last usable day. Negative = expired. */
export function daysRemaining(window: CycleWindow, today: ISODate): number {
  void window, today;
  throw new Error("unimplemented (Phase A)");
}

/** Warn threshold per constants.WARN_THRESHOLD_DAYS. */
export function warnThresholdDays(frequency: Frequency): number {
  void frequency;
  throw new Error("unimplemented (Phase A)");
}

/** today within window AND daysRemaining <= warnThresholdDays(frequency). */
export function isExpiringSoon(
  window: CycleWindow,
  frequency: Frequency,
  today: ISODate,
): boolean {
  void window, frequency, today;
  throw new Error("unimplemented (Phase A)");
}

/**
 * The card's anniversary-anchored ANNUAL window containing today — used to
 * render "$X annual fee renews on <window.end + 1 day>" pseudo-items.
 */
export function feeRenewalCycle(card: CycleCard, today: ISODate): CycleWindow {
  void card, today;
  throw new Error("unimplemented (Phase A)");
}

/** row?.used ?? benefit.automatic */
export function effectiveUsed(
  benefit: Pick<Benefit, "automatic">,
  row: { used: boolean | null } | null | undefined,
): boolean {
  void benefit, row;
  throw new Error("unimplemented (Phase A)");
}
