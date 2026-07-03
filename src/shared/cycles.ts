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
import { WARN_THRESHOLD_DAYS } from "./constants";
import { addDays, addMonthsClamped, cmpDate, daysBetween } from "./dates";

/** Minimal structural inputs so tests don't need full entities. */
export type CycleBenefit = Pick<Benefit, "frequency" | "anchor" | "startDate">;
export type CycleCard = Pick<Card, "anniversaryDate">;

const BLOCK_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar-anchored window containing `date`. */
function calendarWindow(freq: Frequency, date: ISODate): CycleWindow {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  let startMonth: number;
  let key: string;
  switch (freq) {
    case "monthly":
      startMonth = m;
      key = `${y}-${pad2(m)}`;
      break;
    case "quarterly": {
      const q = Math.floor((m - 1) / 3); // 0..3
      startMonth = q * 3 + 1;
      key = `${y}-Q${q + 1}`;
      break;
    }
    case "semiannual": {
      const h = m <= 6 ? 0 : 1;
      startMonth = h * 6 + 1;
      key = `${y}-H${h + 1}`;
      break;
    }
    case "annual":
      startMonth = 1;
      key = `${y}`;
      break;
  }
  const start = `${y}-${pad2(startMonth)}-01`;
  const next = addMonthsClamped(start, BLOCK_MONTHS[freq]);
  const end = addDays(next, -1);
  return { key, start, end };
}

/** i-th anniversary boundary; clamping is always re-derived from base's day. */
function boundary(base: ISODate, i: number, block: number): ISODate {
  return addMonthsClamped(base, i * block);
}

/** Anniversary-anchored window containing `date`. */
function anniversaryWindow(
  freq: Frequency,
  card: CycleCard,
  date: ISODate,
): CycleWindow {
  const block = BLOCK_MONTHS[freq];
  const base = card.anniversaryDate;
  const by = Number(base.slice(0, 4));
  const bm = Number(base.slice(5, 7));
  const dy = Number(date.slice(0, 4));
  const dm = Number(date.slice(5, 7));
  // Estimate the block index, then adjust for day-level clamp drift.
  let i = Math.floor(((dy - by) * 12 + (dm - bm)) / block);
  while (cmpDate(boundary(base, i, block), date) > 0) i--;
  while (cmpDate(boundary(base, i + 1, block), date) <= 0) i++;
  const start = boundary(base, i, block);
  const end = addDays(boundary(base, i + 1, block), -1);
  return { key: `A${start}`, start, end };
}

/** The window (per semantics above) containing `date`. */
export function cycleForDate(
  benefit: CycleBenefit,
  card: CycleCard,
  date: ISODate,
): CycleWindow {
  return benefit.anchor === "calendar"
    ? calendarWindow(benefit.frequency, date)
    : anniversaryWindow(benefit.frequency, card, date);
}

/** cycleForDate(benefit, card, today). */
export function currentCycle(
  benefit: CycleBenefit,
  card: CycleCard,
  today: ISODate,
): CycleWindow {
  return cycleForDate(benefit, card, today);
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
  const result: CycleWindow[] = [];
  if (limit <= 0) return result;
  const current = currentCycle(benefit, card, today);
  let w = cycleForDate(benefit, card, addDays(current.start, -1));
  while (result.length < limit && cmpDate(w.end, benefit.startDate) >= 0) {
    result.push(w);
    w = cycleForDate(benefit, card, addDays(w.start, -1));
  }
  return result;
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
  if (benefit.anchor === "anniversary") {
    const m = /^A(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const w = anniversaryWindow(benefit.frequency, card, date);
    return w.start === date ? w : null;
  }
  switch (benefit.frequency) {
    case "monthly": {
      const m = /^(\d{4})-(\d{2})$/.exec(key);
      if (!m) return null;
      const mm = Number(m[2]);
      if (mm < 1 || mm > 12) return null;
      const w = calendarWindow("monthly", `${m[1]}-${m[2]}-01`);
      return w.key === key ? w : null;
    }
    case "quarterly": {
      const m = /^(\d{4})-Q([1-4])$/.exec(key);
      if (!m) return null;
      const sm = (Number(m[2]) - 1) * 3 + 1;
      const w = calendarWindow("quarterly", `${m[1]}-${pad2(sm)}-01`);
      return w.key === key ? w : null;
    }
    case "semiannual": {
      const m = /^(\d{4})-H([12])$/.exec(key);
      if (!m) return null;
      const sm = Number(m[2]) === 1 ? 1 : 7;
      const w = calendarWindow("semiannual", `${m[1]}-${pad2(sm)}-01`);
      return w.key === key ? w : null;
    }
    case "annual": {
      const m = /^(\d{4})$/.exec(key);
      if (!m) return null;
      const w = calendarWindow("annual", `${m[1]}-01-01`);
      return w.key === key ? w : null;
    }
  }
}

/** window.end - today in days. 0 = last usable day. Negative = expired. */
export function daysRemaining(window: CycleWindow, today: ISODate): number {
  return daysBetween(today, window.end);
}

/** Warn threshold per constants.WARN_THRESHOLD_DAYS. */
export function warnThresholdDays(frequency: Frequency): number {
  return WARN_THRESHOLD_DAYS[frequency];
}

/** today within window AND daysRemaining <= warnThresholdDays(frequency). */
export function isExpiringSoon(
  window: CycleWindow,
  frequency: Frequency,
  today: ISODate,
): boolean {
  const withinWindow =
    cmpDate(today, window.start) >= 0 && cmpDate(today, window.end) <= 0;
  return withinWindow && daysRemaining(window, today) <= warnThresholdDays(frequency);
}

/**
 * The card's anniversary-anchored ANNUAL window containing today — used to
 * render "$X annual fee renews on <window.end + 1 day>" pseudo-items.
 */
export function feeRenewalCycle(card: CycleCard, today: ISODate): CycleWindow {
  return anniversaryWindow("annual", card, today);
}

/** row?.used ?? benefit.automatic */
export function effectiveUsed(
  benefit: Pick<Benefit, "automatic">,
  row: { used: boolean | null } | null | undefined,
): boolean {
  return row?.used ?? benefit.automatic;
}
