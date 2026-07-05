import { describe, expect, it } from "vitest";
import type {
  Anchor,
  Benefit,
  Card,
  Frequency,
  UsageRow,
} from "../src/shared/types";
import { computeDashboard } from "../src/shared/dashboard";

function mkCard(over: Partial<Card> & { id: string }): Card {
  return {
    name: `Card ${over.id}`,
    issuer: null,
    annualFeeCents: 0,
    anniversaryDate: "2020-07-30",
    status: "active",
    closedAt: null,
    createdAt: "2020-01-01T00:00:00Z",
    ...over,
  };
}

function mkBenefit(
  over: Partial<Benefit> & { id: string; cardId: string },
): Benefit {
  return {
    name: `Benefit ${over.id}`,
    description: null,
    valueCents: null,
    frequency: "monthly" as Frequency,
    anchor: "calendar" as Anchor,
    category: "other" as const,
    automatic: false,
    active: true,
    startDate: "2020-01-01",
    deactivatedAt: null,
    createdAt: "2020-01-01T00:00:00Z",
    ...over,
  };
}

function usage(
  benefitId: string,
  cycleKey: string,
  used: boolean | null,
  comment: string | null = null,
): UsageRow {
  return {
    id: `u-${benefitId}-${cycleKey}`,
    benefitId,
    cycleKey,
    used,
    comment,
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const TODAY = "2026-07-28";

// Card A: active, has fee, anniversary Jul 30 => fee window ends 2026-07-29 (1 day out).
const cardA = mkCard({
  id: "A",
  name: "Alpha",
  annualFeeCents: 69500,
  anniversaryDate: "2020-07-30",
});
// Card B: closed — everything on it must be excluded.
const cardB = mkCard({ id: "B", name: "Bravo", status: "closed" });
// Card C: active, no fee (annualFeeCents 0). Still produces a renewal row so
// $0 cards get a reminder; its Nov anniversary keeps it out of expiringSoon.
const cardC = mkCard({
  id: "C",
  name: "Charlie",
  annualFeeCents: 0,
  anniversaryDate: "2020-11-15",
});

const benefits: Benefit[] = [
  mkBenefit({ id: "b1", cardId: "A", name: "Uber Cash", valueCents: 1500 }),
  mkBenefit({ id: "b2", cardId: "A", name: "Digital Ent", valueCents: 2000, automatic: true }),
  mkBenefit({ id: "b3", cardId: "A", name: "Streaming", valueCents: 500, automatic: true }),
  mkBenefit({ id: "b4", cardId: "A", name: "Hotel", valueCents: 999 }),
  mkBenefit({ id: "b5", cardId: "A", name: "Quarterly thing", frequency: "quarterly", valueCents: null }),
  mkBenefit({ id: "b6", cardId: "A", name: "Wireless", valueCents: null }),
  mkBenefit({ id: "b7", cardId: "A", name: "Airline fee credit", valueCents: 1500 }),
  mkBenefit({ id: "b8", cardId: "A", name: "Q null test", frequency: "quarterly", valueCents: 300 }),
  mkBenefit({ id: "bInactive", cardId: "A", name: "Old benefit", active: false, valueCents: 100 }),
  mkBenefit({ id: "bClosed", cardId: "B", name: "On closed card", valueCents: 100 }),
];

const usageRows: UsageRow[] = [
  usage("b3", "2026-07", false), // automatic benefit explicitly UNCHECKED → should expire
  usage("b4", "2026-07", true, "used at airport"), // used → excluded from expiring
  usage("b8", "2026-Q3", null, "note"), // used=null → non-explicit, eff=automatic(false)
];

const dash = computeDashboard(
  [cardA, cardB, cardC],
  benefits,
  usageRows,
  TODAY,
);

describe("computeDashboard: today passthrough", () => {
  it("echoes today", () => {
    expect(dash.today).toBe(TODAY);
  });
});

describe("computeDashboard: current", () => {
  it("one item per active benefit on an active card (excludes inactive + closed-card)", () => {
    const ids = dash.current.map((i) => i.benefitId).sort();
    expect(ids).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
  });

  it("resolves effectiveUsed / explicit / comment from usage rows", () => {
    const byId = new Map(dash.current.map((i) => [i.benefitId, i]));

    // b2 automatic, no row → used, non-explicit
    expect(byId.get("b2")).toMatchObject({ effectiveUsed: true, explicit: false, automatic: true });
    // b3 automatic but explicitly unchecked
    expect(byId.get("b3")).toMatchObject({ effectiveUsed: false, explicit: true, automatic: true });
    // b4 explicitly used with a comment
    expect(byId.get("b4")).toMatchObject({ effectiveUsed: true, explicit: true, comment: "used at airport" });
    // b1 no row → not used, non-explicit
    expect(byId.get("b1")).toMatchObject({ effectiveUsed: false, explicit: false, comment: null });
    // b8 row with used=null → falls through to automatic(false), non-explicit, comment kept
    expect(byId.get("b8")).toMatchObject({ effectiveUsed: false, explicit: false, comment: "note" });
  });

  it("uses the current cycle window/key", () => {
    const b1 = dash.current.find((i) => i.benefitId === "b1")!;
    expect(b1.window.key).toBe("2026-07");
    expect(b1.daysRemaining).toBe(3); // 2026-07-28 → 2026-07-31
  });
});

describe("computeDashboard: feeRenewals", () => {
  it("one per active card incl. $0-fee cards (closed cards excluded)", () => {
    // A (fee) + C ($0 fee); B is closed. Sorted by daysRemaining asc.
    expect(dash.feeRenewals.map((f) => f.cardId)).toEqual(["A", "C"]);
    const fee = dash.feeRenewals[0]!;
    expect(fee).toMatchObject({
      kind: "annual_fee",
      cardId: "A",
      name: "Annual fee",
      valueCents: 69500,
      effectiveUsed: false,
      explicit: false,
      automatic: false,
      comment: null,
    });
    expect(fee.window.end).toBe("2026-07-29");
    expect(fee.daysRemaining).toBe(1);
    expect(fee.benefitId).toBeUndefined();
  });

  it("a $0-fee card still gets a renewal row (valueCents 0)", () => {
    const c = dash.feeRenewals.find((f) => f.cardId === "C")!;
    expect(c).toMatchObject({ kind: "annual_fee", valueCents: 0 });
  });

  it("$0-fee card renewing outside FEE_WARN_DAYS stays out of expiringSoon", () => {
    expect(dash.expiringSoon.some((i) => i.cardId === "C")).toBe(false);
  });

  it("$0-fee card renewing within FEE_WARN_DAYS DOES enter expiringSoon", () => {
    const soonCard = mkCard({
      id: "Z",
      name: "Zero",
      annualFeeCents: 0,
      anniversaryDate: "2020-07-30", // window ends 2026-07-29, 1 day out
    });
    const d = computeDashboard([soonCard], [], [], TODAY);
    const z = d.expiringSoon.find((i) => i.cardId === "Z")!;
    expect(z).toMatchObject({ kind: "annual_fee", valueCents: 0 });
  });
});

describe("computeDashboard: expiringSoon", () => {
  it("composition: unused-in-threshold benefits + fee within FEE_WARN_DAYS", () => {
    // Members: fee(A), b1, b3 (auto unchecked), b6, b7.
    // Excluded: b2 (auto used), b4 (used), b5/b8 (quarterly, not within 14d).
    const ids = dash.expiringSoon.map((i) => i.benefitId ?? i.kind);
    expect(ids).toEqual(["annual_fee", "b7", "b1", "b3", "b6"]);
  });

  it("sort order: daysRemaining asc, then valueCents desc (nulls last), then name asc", () => {
    const rows = dash.expiringSoon.map((i) => [
      i.daysRemaining,
      i.valueCents,
      i.name,
    ]);
    expect(rows).toEqual([
      [1, 69500, "Annual fee"], // day 1
      [3, 1500, "Airline fee credit"], // day 3, val 1500, name asc
      [3, 1500, "Uber Cash"],
      [3, 500, "Streaming"],
      [3, null, "Wireless"], // null value sorts last
    ]);
  });

  it("automatic benefit appears ONLY when explicitly unchecked", () => {
    const ids = dash.expiringSoon.map((i) => i.benefitId);
    expect(ids).toContain("b3"); // explicitly unchecked automatic
    expect(ids).not.toContain("b2"); // automatic, still auto-used
  });

  it("used benefits are excluded", () => {
    const ids = dash.expiringSoon.map((i) => i.benefitId);
    expect(ids).not.toContain("b4");
  });
});

describe("computeDashboard: empty inputs", () => {
  it("handles no cards", () => {
    const empty = computeDashboard([], [], [], TODAY);
    expect(empty).toEqual({
      today: TODAY,
      expiringSoon: [],
      current: [],
      feeRenewals: [],
    });
  });
});
