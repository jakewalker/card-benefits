import { describe, expect, it } from "vitest";
import type { Card } from "../src/shared/types";
import { buildRenewalsIcs } from "../src/shared/ics";

function mkCard(over: Partial<Card> & { id: string }): Card {
  return {
    name: `Card ${over.id}`,
    issuer: null,
    annualFeeCents: 9500,
    anniversaryDate: "2020-09-01",
    status: "active",
    closedAt: null,
    createdAt: "2020-01-01T00:00:00Z",
    ...over,
  };
}

const TODAY = "2026-07-05";
const NOW = "2026-07-05T03:45:00.000Z";

describe("buildRenewalsIcs", () => {
  it("emits a valid calendar envelope", () => {
    const ics = buildRenewalsIcs([], TODAY, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("\r\n"); // CRLF line endings
  });

  it("includes only active fee cards with a date", () => {
    const cards = [
      mkCard({ id: "fee", name: "Sapphire", annualFeeCents: 79500 }),
      mkCard({ id: "nofee", annualFeeCents: 0 }), // excluded: no fee
      mkCard({ id: "nodate", anniversaryDate: null }), // excluded: no date
      mkCard({ id: "closed", status: "closed" }), // excluded: closed
    ];
    const ics = buildRenewalsIcs(cards, TODAY, NOW);
    const uids = [...ics.matchAll(/UID:renewal-(\w+)@/g)].map((m) => m[1]);
    expect(uids).toEqual(["fee"]);
  });

  it("builds a yearly all-day event on the next renewal with both alarms", () => {
    // anniversary Sep 1; today Jul 5 2026 → next renewal 2026-09-01.
    const ics = buildRenewalsIcs([mkCard({ id: "a" })], TODAY, NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    expect(ics).toContain("DTEND;VALUE=DATE:20260902");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(ics).toContain("TRIGGER:-P30D");
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("DTSTAMP:20260705T034500Z");
  });

  it("formats the fee and escapes text", () => {
    const ics = buildRenewalsIcs(
      [mkCard({ id: "a", name: "Gold, Card", annualFeeCents: 32500, issuer: "Amex" })],
      TODAY,
      NOW,
    );
    expect(ics).toContain("SUMMARY:Gold\\, Card — $325 annual fee");
    expect(ics).toContain("Amex · Annual fee renews");
  });

  it("honors custom alarm days", () => {
    const ics = buildRenewalsIcs([mkCard({ id: "a" })], TODAY, NOW, {
      alarmDaysBefore: [14],
    });
    expect(ics).toContain("TRIGGER:-P14D");
    expect(ics).not.toContain("TRIGGER:-P30D");
  });
});
