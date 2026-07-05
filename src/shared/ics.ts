/**
 * iCalendar (RFC 5545) feed for card annual-fee renewals — PURE (no Date; pass
 * `today` and `nowStamp` in). One yearly-recurring, all-day VEVENT per ACTIVE
 * card that has both a fee (> 0) and a known anniversary date. No-fee or
 * dateless cards are omitted (nothing to remind about).
 *
 * The event date is the NEXT renewal (feeRenewalCycle's window end + 1) with
 * RRULE:FREQ=YEARLY so it repeats every year. Optional DISPLAY alarms fire N
 * days before (default 30 and 7).
 */
import type { Card, ISODate } from "./types";
import { addDays } from "./dates";
import { feeRenewalCycle } from "./cycles";

export interface IcsOptions {
  /** Days-before values for VALARM reminders. Default [30, 7]. */
  alarmDaysBefore?: number[];
  /** Calendar display name. */
  calName?: string;
  /** Domain used to build stable UIDs. */
  domain?: string;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' (DATE value type). */
function toDateValue(iso: ISODate): string {
  return iso.replace(/-/g, "");
}

/** ISO timestamp → UTC basic format 'YYYYMMDDTHHMMSSZ' for DTSTAMP. */
function toStamp(nowStamp: string): string {
  const digits = nowStamp.replace(/[-:]/g, "").replace(/\.\d+/, "");
  // '20260705T034500Z'
  return digits.endsWith("Z") ? digits : `${digits}Z`;
}

/** Fold a logical line to <=75 octets per RFC 5545 (continuation = CRLF + SPACE). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

function formatDollars(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}

export function buildRenewalsIcs(
  cards: Card[],
  today: ISODate,
  nowStamp: string,
  opts: IcsOptions = {},
): string {
  const alarms = opts.alarmDaysBefore ?? [30, 7];
  const calName = opts.calName ?? "Card Renewals";
  const domain = opts.domain ?? "cards.local";
  const stamp = toStamp(nowStamp);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//card-benefits//renewals//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  const eligible = cards
    .filter(
      (c) =>
        c.status === "active" &&
        c.annualFeeCents > 0 &&
        c.anniversaryDate !== null,
    )
    // Stable output order for testability.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const card of eligible) {
    const window = feeRenewalCycle(card, today);
    if (window === null) continue; // guarded by the filter, but keep types honest
    const renews = addDays(window.end, 1);
    const summary = `${card.name} — ${formatDollars(card.annualFeeCents)} annual fee`;
    const description = `${card.issuer ? `${card.issuer} · ` : ""}Annual fee renews. Decide keep or cancel.`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:renewal-${card.id}@${domain}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toDateValue(renews)}`,
      `DTEND;VALUE=DATE:${toDateValue(addDays(renews, 1))}`,
      "RRULE:FREQ=YEARLY",
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
    );
    for (const days of alarms) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`${summary} renews in ${days} days`)}`,
        `TRIGGER:-P${days}D`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
