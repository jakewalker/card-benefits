import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  cmpDate,
  daysBetween,
  todayInAppTz,
} from "../src/shared/dates";

describe("addDays", () => {
  const cases: Array<[string, number, string]> = [
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-02-28", 1, "2026-03-01"], // 2026 not leap
    ["2024-02-28", 1, "2024-02-29"], // leap
    ["2024-02-29", 1, "2024-03-01"],
    ["2026-12-31", 1, "2027-01-01"], // year boundary
    ["2027-01-01", -1, "2026-12-31"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2024-03-01", -1, "2024-02-29"], // leap
    ["2026-07-15", 0, "2026-07-15"],
    ["2020-02-29", 365, "2021-02-28"],
    ["2026-01-01", 365, "2027-01-01"], // 2026 has 365 days
    ["2024-01-01", 366, "2025-01-01"], // 2024 leap
  ];
  it.each(cases)("addDays(%s, %i) === %s", (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected);
  });
});

describe("daysBetween", () => {
  const cases: Array<[string, string, number]> = [
    ["2026-01-01", "2026-01-01", 0],
    ["2026-01-01", "2026-12-31", 364],
    ["2024-01-01", "2024-12-31", 365], // leap
    ["2026-12-31", "2027-01-01", 1],
    ["2026-02-28", "2026-03-01", 1],
    ["2024-02-28", "2024-03-01", 2], // leap: Feb 29 in between
    ["2026-03-01", "2026-02-28", -1], // negative
    ["2020-01-01", "2021-01-01", 366], // 2020 leap
    ["2021-01-01", "2022-01-01", 365],
  ];
  it.each(cases)("daysBetween(%s, %s) === %i", (a, b, expected) => {
    expect(daysBetween(a, b)).toBe(expected);
  });
});

describe("addMonthsClamped", () => {
  const cases: Array<[string, number, string]> = [
    ["2026-01-31", 1, "2026-02-28"], // clamp Feb (non-leap)
    ["2026-01-31", 2, "2026-03-31"], // clamp does NOT propagate
    ["2026-01-31", 3, "2026-04-30"],
    ["2024-01-31", 1, "2024-02-29"], // clamp Feb (leap)
    ["2024-01-31", 2, "2024-03-31"], // non-propagation in leap
    ["2026-01-15", 1, "2026-02-15"],
    ["2026-12-15", 1, "2027-01-15"], // year rollover
    ["2026-07-31", 1, "2026-08-31"],
    ["2026-08-31", 1, "2026-09-30"], // 30-day month clamp
    ["2026-01-31", 12, "2027-01-31"],
    ["2026-01-31", 13, "2027-02-28"], // next-year Feb clamp
    ["2026-03-31", -1, "2026-02-28"], // negative months
    ["2026-01-31", 0, "2026-01-31"],
  ];
  it.each(cases)("addMonthsClamped(%s, %i) === %s", (d, n, expected) => {
    expect(addMonthsClamped(d, n)).toBe(expected);
  });

  it("clamp is re-derived from the original day (non-propagation chain)", () => {
    const anchor = "2026-01-31";
    expect(addMonthsClamped(anchor, 1)).toBe("2026-02-28");
    expect(addMonthsClamped(anchor, 2)).toBe("2026-03-31");
    expect(addMonthsClamped(anchor, 3)).toBe("2026-04-30");
    expect(addMonthsClamped(anchor, 4)).toBe("2026-05-31");
  });
});

describe("todayInAppTz (America/New_York)", () => {
  const cases: Array<[string, string]> = [
    // EDT (UTC-4) in July: 03:00Z is still the previous day in NY.
    ["2026-07-04T03:00:00Z", "2026-07-03"],
    ["2026-07-04T04:00:00Z", "2026-07-04"], // 00:00 EDT
    // EST (UTC-5) in January.
    ["2026-01-15T04:59:00Z", "2026-01-14"],
    ["2026-01-15T05:00:00Z", "2026-01-15"], // 00:00 EST
    // Year boundary in EST.
    ["2027-01-01T04:00:00Z", "2026-12-31"],
    ["2027-01-01T05:00:00Z", "2027-01-01"],
  ];
  it.each(cases)("todayInAppTz(%s) === %s", (iso, expected) => {
    expect(todayInAppTz(new Date(iso))).toBe(expected);
  });
});

describe("cmpDate", () => {
  it("orders dates", () => {
    expect(cmpDate("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(cmpDate("2026-01-02", "2026-01-01")).toBeGreaterThan(0);
    expect(cmpDate("2026-01-01", "2026-01-01")).toBe(0);
    expect(cmpDate("2025-12-31", "2026-01-01")).toBeLessThan(0);
  });
});
