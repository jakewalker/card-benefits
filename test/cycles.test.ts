import { describe, expect, it } from "vitest";
import type { Anchor, Frequency } from "../src/shared/types";
import {
  CycleBenefit,
  CycleCard,
  cycleForDate,
  cycleWindowForKey,
  daysRemaining,
  effectiveUsed,
  feeRenewalCycle,
  isExpiringSoon,
  previousCycles,
  warnThresholdDays,
} from "../src/shared/cycles";

function ben(
  frequency: Frequency,
  anchor: Anchor,
  startDate = "2000-01-01",
): CycleBenefit {
  return { frequency, anchor, startDate };
}
function card(anniversaryDate: string): CycleCard {
  return { anniversaryDate };
}
const noAnniv = card("2000-01-01");

describe("calendar windows", () => {
  const cases: Array<[Frequency, string, string, string, string]> = [
    // freq, date, start, end, key
    ["monthly", "2026-07-15", "2026-07-01", "2026-07-31", "2026-07"],
    ["monthly", "2026-12-10", "2026-12-01", "2026-12-31", "2026-12"],
    ["monthly", "2026-02-10", "2026-02-01", "2026-02-28", "2026-02"], // non-leap
    ["monthly", "2024-02-10", "2024-02-01", "2024-02-29", "2024-02"], // leap
    ["quarterly", "2026-07-15", "2026-07-01", "2026-09-30", "2026-Q3"],
    ["quarterly", "2026-01-01", "2026-01-01", "2026-03-31", "2026-Q1"],
    ["quarterly", "2026-12-31", "2026-10-01", "2026-12-31", "2026-Q4"], // year boundary
    ["semiannual", "2026-03-15", "2026-01-01", "2026-06-30", "2026-H1"],
    ["semiannual", "2026-07-01", "2026-07-01", "2026-12-31", "2026-H2"],
    ["semiannual", "2026-06-30", "2026-01-01", "2026-06-30", "2026-H1"], // H1 last day
    ["annual", "2026-07-15", "2026-01-01", "2026-12-31", "2026"],
    ["annual", "2026-12-31", "2026-01-01", "2026-12-31", "2026"],
    ["annual", "2027-01-01", "2027-01-01", "2027-12-31", "2027"], // year boundary
  ];
  it.each(cases)(
    "%s @ %s => [%s, %s] %s",
    (freq, date, start, end, key) => {
      const w = cycleForDate(ben(freq, "calendar"), noAnniv, date);
      expect(w).toEqual({ key, start, end });
    },
  );
});

describe("anniversary windows", () => {
  // Feb 15 annual anniversary
  it("annual: mid-window, boundary day, and previous window", () => {
    const b = ben("annual", "anniversary");
    const c = card("2020-02-15");
    expect(cycleForDate(b, c, "2026-06-01")).toEqual({
      key: "A2026-02-15",
      start: "2026-02-15",
      end: "2027-02-14",
    });
    expect(cycleForDate(b, c, "2026-02-15")).toEqual({
      key: "A2026-02-15",
      start: "2026-02-15",
      end: "2027-02-14",
    });
    expect(cycleForDate(b, c, "2026-02-14")).toEqual({
      key: "A2025-02-15",
      start: "2025-02-15",
      end: "2026-02-14",
    });
  });

  it("Feb 29 anniversary: clamps to Feb 28 in non-leap years, Feb 29 in leap", () => {
    const b = ben("annual", "anniversary");
    const c = card("2024-02-29");
    // 2026 non-leap → boundary Feb 28
    expect(cycleForDate(b, c, "2026-06-01")).toEqual({
      key: "A2026-02-28",
      start: "2026-02-28",
      end: "2027-02-27",
    });
    // 2028 leap → boundary Feb 29
    expect(cycleForDate(b, c, "2028-06-01")).toEqual({
      key: "A2028-02-29",
      start: "2028-02-29",
      end: "2029-02-27",
    });
  });

  it("Jan 31 monthly anniversary: non-propagating clamp chain (non-leap 2026)", () => {
    const b = ben("monthly", "anniversary");
    const c = card("2020-01-31");
    // window containing Feb 10 2026 => [Jan 31, Feb 27]
    expect(cycleForDate(b, c, "2026-02-10")).toEqual({
      key: "A2026-01-31",
      start: "2026-01-31",
      end: "2026-02-27",
    });
    // window starting Feb 28 => [Feb 28, Mar 30]
    expect(cycleForDate(b, c, "2026-02-28")).toEqual({
      key: "A2026-02-28",
      start: "2026-02-28",
      end: "2026-03-30",
    });
    // window starting Mar 31 => [Mar 31, Apr 29]
    expect(cycleForDate(b, c, "2026-03-31")).toEqual({
      key: "A2026-03-31",
      start: "2026-03-31",
      end: "2026-04-29",
    });
  });

  it("quarterly and semiannual anniversary blocks", () => {
    const c = card("2020-03-10");
    // quarterly blocks: Mar10, Jun10, Sep10, Dec10
    expect(cycleForDate(ben("quarterly", "anniversary"), c, "2026-07-01")).toEqual({
      key: "A2026-06-10",
      start: "2026-06-10",
      end: "2026-09-09",
    });
    // semiannual blocks: Mar10, Sep10
    expect(cycleForDate(ben("semiannual", "anniversary"), c, "2026-07-01")).toEqual({
      key: "A2026-03-10",
      start: "2026-03-10",
      end: "2026-09-09",
    });
  });
});

describe("cycleWindowForKey round-trips", () => {
  const anchors: Anchor[] = ["calendar", "anniversary"];
  const freqs: Frequency[] = ["monthly", "quarterly", "semiannual", "annual"];
  const cards: CycleCard[] = [
    card("2020-02-15"),
    card("2024-02-29"),
    card("2020-01-31"),
    card("2019-11-07"),
  ];
  const dates = [
    "2026-01-01",
    "2026-02-28",
    "2026-03-31",
    "2026-06-30",
    "2026-07-15",
    "2026-11-30",
    "2026-12-31",
    "2028-02-29",
  ];
  for (const anchor of anchors) {
    for (const frequency of freqs) {
      for (const c of anchor === "anniversary" ? cards : [noAnniv]) {
        it(`${anchor}/${frequency} anniv=${c.anniversaryDate}`, () => {
          const b = ben(frequency, anchor);
          for (const d of dates) {
            const w = cycleForDate(b, c, d);
            expect(cycleWindowForKey(b, c, w.key)).toEqual(w);
          }
        });
      }
    }
  }
});

describe("cycleWindowForKey invalid keys => null", () => {
  it("bad formats and cross-anchor keys", () => {
    const cal = ben("monthly", "calendar");
    const calQ = ben("quarterly", "calendar");
    const anniv = ben("annual", "anniversary");
    const c = card("2020-02-15");

    expect(cycleWindowForKey(cal, noAnniv, "2026-13")).toBeNull(); // month > 12
    expect(cycleWindowForKey(cal, noAnniv, "2026-00")).toBeNull(); // month < 1
    expect(cycleWindowForKey(cal, noAnniv, "2026-Q3")).toBeNull(); // wrong shape
    expect(cycleWindowForKey(cal, noAnniv, "A2026-02-15")).toBeNull(); // anniv key
    expect(cycleWindowForKey(cal, noAnniv, "garbage")).toBeNull();
    expect(cycleWindowForKey(cal, noAnniv, "")).toBeNull();
    expect(cycleWindowForKey(calQ, noAnniv, "2026-Q5")).toBeNull(); // quarter > 4
    expect(cycleWindowForKey(calQ, noAnniv, "2026-07")).toBeNull(); // monthly key

    expect(cycleWindowForKey(anniv, c, "2026")).toBeNull(); // calendar key
    expect(cycleWindowForKey(anniv, c, "A2026-02-16")).toBeNull(); // misaligned date
    expect(cycleWindowForKey(anniv, c, "A2026-02-30")).toBeNull(); // impossible date
    expect(cycleWindowForKey(anniv, c, "Axxxx")).toBeNull();
  });

  it("aligned anniversary key resolves", () => {
    const anniv = ben("annual", "anniversary");
    const c = card("2020-02-15");
    expect(cycleWindowForKey(anniv, c, "A2026-02-15")).toEqual({
      key: "A2026-02-15",
      start: "2026-02-15",
      end: "2027-02-14",
    });
  });
});

describe("previousCycles", () => {
  it("newest first, excludes current, clamps at startDate (whole cycle start)", () => {
    const b = ben("monthly", "calendar", "2026-01-10");
    const got = previousCycles(b, noAnniv, "2026-04-15", 12).map((w) => w.key);
    expect(got).toEqual(["2026-03", "2026-02", "2026-01"]);
  });

  it("includes the window CONTAINING a mid-cycle startDate", () => {
    const b = ben("monthly", "calendar", "2026-01-20");
    const got = previousCycles(b, noAnniv, "2026-04-15", 12).map((w) => w.key);
    expect(got).toEqual(["2026-03", "2026-02", "2026-01"]);
  });

  it("excludes windows ending before startDate", () => {
    const b = ben("monthly", "calendar", "2026-02-01");
    const got = previousCycles(b, noAnniv, "2026-04-15", 12).map((w) => w.key);
    expect(got).toEqual(["2026-03", "2026-02"]);
  });

  it("respects limit", () => {
    const b = ben("monthly", "calendar", "2026-01-10");
    const got = previousCycles(b, noAnniv, "2026-04-15", 2).map((w) => w.key);
    expect(got).toEqual(["2026-03", "2026-02"]);
  });

  it("limit <= 0 returns empty", () => {
    const b = ben("monthly", "calendar", "2026-01-10");
    expect(previousCycles(b, noAnniv, "2026-04-15", 0)).toEqual([]);
  });

  it("anniversary annual previous cycles", () => {
    const b = ben("annual", "anniversary", "2024-03-01");
    const c = card("2020-02-15");
    const got = previousCycles(b, c, "2026-06-01", 12).map((w) => w.key);
    // current window A2026-02-15; window containing startDate is A2024-02-15
    // (spans 2024-02-15..2025-02-14); A2023 ends 2024-02-14 < startDate → excluded.
    expect(got).toEqual(["A2025-02-15", "A2024-02-15"]);
  });
});

describe("daysRemaining", () => {
  const w = { key: "2026-07", start: "2026-07-01", end: "2026-07-31" };
  it.each([
    ["2026-07-31", 0],
    ["2026-07-30", 1],
    ["2026-08-01", -1],
    ["2026-07-01", 30],
  ] as Array<[string, number]>)("daysRemaining(@%s) === %i", (today, expected) => {
    expect(daysRemaining(w, today)).toBe(expected);
  });
});

describe("warnThresholdDays", () => {
  it("matches constants", () => {
    expect(warnThresholdDays("monthly")).toBe(7);
    expect(warnThresholdDays("quarterly")).toBe(14);
    expect(warnThresholdDays("semiannual")).toBe(30);
    expect(warnThresholdDays("annual")).toBe(30);
  });
});

describe("isExpiringSoon (threshold off-by-ones)", () => {
  const july = { key: "2026-07", start: "2026-07-01", end: "2026-07-31" };
  it("monthly: exactly at threshold (7) true, threshold+1 (8) false", () => {
    expect(isExpiringSoon(july, "monthly", "2026-07-24")).toBe(true); // 7 left
    expect(isExpiringSoon(july, "monthly", "2026-07-23")).toBe(false); // 8 left
    expect(isExpiringSoon(july, "monthly", "2026-07-31")).toBe(true); // 0 left
  });

  it("quarterly: exactly at threshold (14) true, 15 false", () => {
    const q3 = { key: "2026-Q3", start: "2026-07-01", end: "2026-09-30" };
    expect(isExpiringSoon(q3, "quarterly", "2026-09-16")).toBe(true); // 14 left
    expect(isExpiringSoon(q3, "quarterly", "2026-09-15")).toBe(false); // 15 left
  });

  it("false when today is outside the window", () => {
    expect(isExpiringSoon(july, "monthly", "2026-06-30")).toBe(false); // before
    expect(isExpiringSoon(july, "monthly", "2026-08-01")).toBe(false); // after (expired)
  });
});

describe("feeRenewalCycle", () => {
  it("anniversary-anchored annual window containing today", () => {
    const c = card("2020-02-15");
    expect(feeRenewalCycle(c, "2026-06-01")).toEqual({
      key: "A2026-02-15",
      start: "2026-02-15",
      end: "2027-02-14",
    });
  });
});

describe("effectiveUsed (automatic x used matrix)", () => {
  const cases: Array<[boolean, { used: boolean | null } | null | undefined, boolean]> = [
    [true, null, true],
    [false, null, false],
    [true, undefined, true],
    [false, undefined, false],
    [true, { used: null }, true],
    [false, { used: null }, false],
    [true, { used: true }, true],
    [false, { used: true }, true],
    [true, { used: false }, false],
    [false, { used: false }, false],
  ];
  it.each(cases)(
    "automatic=%s row=%o => %s",
    (automatic, row, expected) => {
      expect(effectiveUsed({ automatic }, row)).toBe(expected);
    },
  );
});
