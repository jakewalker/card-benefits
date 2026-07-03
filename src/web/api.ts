/**
 * Typed API client. Owned by Phase C.
 *
 * Two implementations behind one `ApiClient` interface:
 * - Real mode (default): fetches `/api/...`, JSON in/out, throws
 *   `ApiClientError` (carrying the `ApiError` body) on non-2xx responses.
 *   On 401 it dispatches a `window` event ("api:unauthorized") instead of
 *   redirecting — `App.tsx` listens for it and swaps in a login screen.
 * - Mock mode (`import.meta.env.VITE_USE_MOCK === "1"`): serves everything
 *   from an in-memory store seeded with two sample cards and a handful of
 *   benefits, so the UI is fully demoable without the Worker running. The
 *   mock reuses the real cycle-math + dashboard functions from
 *   `src/shared` so its behavior matches what the server will eventually do.
 */
import type {
  ApiError,
  Benefit,
  BenefitInput,
  BenefitWithStatus,
  Card,
  CardDetailPayload,
  CardInput,
  CardListItem,
  DashboardPayload,
  HistoryCycle,
  HistoryPayload,
  ISODate,
  ImportPayload,
  ParsedCardPayload,
  UsageRow,
  UsageUpdate,
} from "../shared/types";
import { DEFAULT_HISTORY_LIMIT } from "../shared/constants";
import { addDays, todayInAppTz } from "../shared/dates";
import {
  currentCycle,
  daysRemaining,
  effectiveUsed,
  isExpiringSoon,
  previousCycles,
} from "../shared/cycles";
import { computeDashboard } from "../shared/dashboard";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by every ApiClient method on a non-2xx response. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error || `Request failed (${status})`);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

function notFound(): ApiClientError {
  return new ApiClientError(404, { error: "Not found", code: "not_found" });
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface ApiClient {
  getDashboard(): Promise<DashboardPayload>;
  listCards(includeClosed?: boolean): Promise<CardListItem[]>;
  createCard(input: CardInput): Promise<Card>;
  getCard(id: string): Promise<CardDetailPayload>;
  updateCard(id: string, input: CardInput): Promise<Card>;
  closeCard(id: string): Promise<Card>;
  reopenCard(id: string): Promise<Card>;
  addBenefit(cardId: string, input: BenefitInput): Promise<Benefit>;
  updateBenefit(
    id: string,
    input: BenefitInput,
    opts?: { force?: boolean },
  ): Promise<Benefit>;
  deactivateBenefit(id: string): Promise<Benefit>;
  reactivateBenefit(id: string): Promise<Benefit>;
  setUsage(
    benefitId: string,
    cycleKey: string,
    update: UsageUpdate,
  ): Promise<UsageRow>;
  getHistory(benefitId: string, limit?: number): Promise<HistoryPayload>;
  parseText(text: string): Promise<ParsedCardPayload>;
  importCard(payload: ImportPayload): Promise<{ card: Card; benefits: Benefit[] }>;
  login(password: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && path !== "/login") {
    window.dispatchEvent(new CustomEvent("api:unauthorized"));
  }

  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = { error: res.statusText || `Request failed (${res.status})` };
    }
    throw new ApiClientError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

const realApi: ApiClient = {
  getDashboard: () => request("/dashboard"),

  listCards: (includeClosed) =>
    request(`/cards${includeClosed ? "?includeClosed=1" : ""}`),

  createCard: (input) =>
    request("/cards", { method: "POST", body: JSON.stringify(input) }),

  getCard: (id) => request(`/cards/${id}`),

  updateCard: (id, input) =>
    request(`/cards/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  closeCard: (id) => request(`/cards/${id}/close`, { method: "POST" }),

  reopenCard: (id) => request(`/cards/${id}/reopen`, { method: "POST" }),

  addBenefit: (cardId, input) =>
    request(`/cards/${cardId}/benefits`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateBenefit: (id, input, opts) =>
    request(`/benefits/${id}${opts?.force ? "?force=1" : ""}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  deactivateBenefit: (id) =>
    request(`/benefits/${id}/deactivate`, { method: "POST" }),

  reactivateBenefit: (id) =>
    request(`/benefits/${id}/reactivate`, { method: "POST" }),

  setUsage: (benefitId, cycleKey, update) =>
    request(`/benefits/${benefitId}/usage/${cycleKey}`, {
      method: "PUT",
      body: JSON.stringify(update),
    }),

  getHistory: (benefitId, limit) =>
    request(
      `/benefits/${benefitId}/history${limit ? `?limit=${limit}` : ""}`,
    ),

  parseText: (text) =>
    request("/parse", { method: "POST", body: JSON.stringify({ text }) }),

  importCard: (payload) =>
    request("/cards/import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (password) =>
    request("/login", { method: "POST", body: JSON.stringify({ password }) }),
};

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Simulate realistic network latency. */
function latency(min = 150, max = 450): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockCards: Card[] = [];
let mockBenefits: Benefit[] = [];
let mockUsage: UsageRow[] = [];
let seeded = false;

function seed(): void {
  const today = todayInAppTz();
  const nowIso = new Date().toISOString();

  // Card A: calendar-anchored benefits, anniversary parked far in the
  // future so its annual fee stays out of "expiring soon" — a calm,
  // steady-state card for contrast.
  const cardA: Card = {
    id: genId("card"),
    name: "Amex Platinum",
    issuer: "American Express",
    annualFeeCents: 69_500,
    anniversaryDate: addDays(today, 210),
    status: "active",
    closedAt: null,
    createdAt: nowIso,
  };

  // Card B: anniversary-anchored benefits, anniversary always ~6 days out
  // (computed relative to "today" every time the app boots) so the
  // dashboard's "expiring soon" section is always populated for the demo.
  const cardB: Card = {
    id: genId("card"),
    name: "Sapphire Reserve",
    issuer: "Chase",
    annualFeeCents: 55_000,
    anniversaryDate: addDays(today, 6),
    status: "active",
    closedAt: null,
    createdAt: nowIso,
  };

  mockCards = [cardA, cardB];

  const longAgo = addDays(today, -400);
  const recent = addDays(today, -50);

  const uberCash: Benefit = {
    id: genId("benefit"),
    cardId: cardA.id,
    name: "Uber Cash",
    description: "Monthly Uber Cash credit; loads automatically.",
    valueCents: 1_500,
    frequency: "monthly",
    anchor: "calendar",
    automatic: true,
    active: true,
    startDate: longAgo,
    deactivatedAt: null,
    createdAt: nowIso,
  };
  const airlineCredit: Benefit = {
    id: genId("benefit"),
    cardId: cardA.id,
    name: "Airline Fee Credit",
    description: "Annual airline incidental-fee credit (one selected airline).",
    valueCents: 20_000,
    frequency: "annual",
    anchor: "calendar",
    automatic: false,
    active: true,
    startDate: longAgo,
    deactivatedAt: null,
    createdAt: nowIso,
  };
  const saksCredit: Benefit = {
    id: genId("benefit"),
    cardId: cardA.id,
    name: "Saks Fifth Avenue Credit",
    description: "Semi-annual credit at Saks Fifth Avenue.",
    valueCents: 5_000,
    frequency: "semiannual",
    anchor: "calendar",
    automatic: false,
    active: true,
    startDate: longAgo,
    deactivatedAt: null,
    createdAt: nowIso,
  };
  const lyftCredit: Benefit = {
    id: genId("benefit"),
    cardId: cardB.id,
    name: "Lyft Credit",
    description: "Monthly Lyft ride credit; loads automatically.",
    valueCents: 1_000,
    frequency: "monthly",
    anchor: "anniversary",
    automatic: true,
    active: true,
    startDate: longAgo,
    deactivatedAt: null,
    createdAt: nowIso,
  };
  const doorDashCredit: Benefit = {
    id: genId("benefit"),
    cardId: cardB.id,
    name: "DoorDash Credit",
    description: "Quarterly DoorDash restaurant credit.",
    valueCents: 5_000,
    frequency: "quarterly",
    anchor: "anniversary",
    automatic: false,
    active: true,
    startDate: recent,
    deactivatedAt: null,
    createdAt: nowIso,
  };
  const travelCredit: Benefit = {
    id: genId("benefit"),
    cardId: cardB.id,
    name: "Annual Travel Credit",
    description: "Cardmember-year credit toward flights and hotels.",
    valueCents: 30_000,
    frequency: "annual",
    anchor: "anniversary",
    automatic: false,
    active: true,
    startDate: longAgo,
    deactivatedAt: null,
    createdAt: nowIso,
  };

  mockBenefits = [
    uberCash,
    airlineCredit,
    saksCredit,
    lyftCredit,
    doorDashCredit,
    travelCredit,
  ];

  const airlineCycle = currentCycle(airlineCredit, cardA, today);
  const saksCycle = currentCycle(saksCredit, cardA, today);
  const lyftCycle = currentCycle(lyftCredit, cardB, today);

  mockUsage = [
    {
      id: genId("usage"),
      benefitId: airlineCredit.id,
      cycleKey: airlineCycle.key,
      used: true,
      comment: "Applied to a Delta baggage fee in March.",
      updatedAt: nowIso,
    },
    {
      id: genId("usage"),
      benefitId: saksCredit.id,
      cycleKey: saksCycle.key,
      used: null,
      comment: "Used $50 so far — rest still available this half.",
      updatedAt: nowIso,
    },
    {
      id: genId("usage"),
      benefitId: lyftCredit.id,
      cycleKey: lyftCycle.key,
      used: false,
      comment: "Credit didn't auto-post this cycle — following up.",
      updatedAt: nowIso,
    },
  ];

  seeded = true;
}

function ensureSeeded(): void {
  if (!seeded) seed();
}

function findCard(id: string): Card {
  const card = mockCards.find((c) => c.id === id);
  if (!card) throw notFound();
  return card;
}

function findBenefit(id: string): Benefit {
  const benefit = mockBenefits.find((b) => b.id === id);
  if (!benefit) throw notFound();
  return benefit;
}

function withStatus(benefit: Benefit, card: Card, today: ISODate): BenefitWithStatus {
  const window = currentCycle(benefit, card, today);
  const row = mockUsage.find(
    (u) => u.benefitId === benefit.id && u.cycleKey === window.key,
  ) ?? null;
  const used = effectiveUsed(benefit, row);
  return {
    ...benefit,
    status: {
      window,
      daysRemaining: daysRemaining(window, today),
      effectiveUsed: used,
      explicit: row?.used != null,
      comment: row?.comment ?? null,
      expiringSoon: !used && isExpiringSoon(window, benefit.frequency, today),
    },
  };
}

const mockApi: ApiClient = {
  async getDashboard() {
    ensureSeeded();
    await latency();
    return computeDashboard(mockCards, mockBenefits, mockUsage, todayInAppTz());
  },

  async listCards(includeClosed) {
    ensureSeeded();
    await latency();
    const today = todayInAppTz();
    return mockCards
      .filter((c) => includeClosed || c.status === "active")
      .map((c) => {
        const benefitsForCard = mockBenefits.filter(
          (b) => b.cardId === c.id && b.active,
        );
        const unusedCount = benefitsForCard.filter((b) => {
          const window = currentCycle(b, c, today);
          const row = mockUsage.find(
            (u) => u.benefitId === b.id && u.cycleKey === window.key,
          ) ?? null;
          return !effectiveUsed(b, row);
        }).length;
        return { ...c, benefitCount: benefitsForCard.length, unusedCount };
      });
  },

  async createCard(input) {
    ensureSeeded();
    await latency();
    const card: Card = {
      id: genId("card"),
      name: input.name,
      issuer: input.issuer ?? null,
      annualFeeCents: input.annualFeeCents,
      anniversaryDate: input.anniversaryDate,
      status: "active",
      closedAt: null,
      createdAt: new Date().toISOString(),
    };
    mockCards.push(card);
    return card;
  },

  async getCard(id) {
    ensureSeeded();
    await latency();
    const card = findCard(id);
    const today = todayInAppTz();
    const benefits = mockBenefits
      .filter((b) => b.cardId === id)
      .map((b) => withStatus(b, card, today));
    return { card, benefits };
  },

  async updateCard(id, input) {
    ensureSeeded();
    await latency();
    const card = findCard(id);
    card.name = input.name;
    card.issuer = input.issuer ?? null;
    card.annualFeeCents = input.annualFeeCents;
    card.anniversaryDate = input.anniversaryDate;
    return card;
  },

  async closeCard(id) {
    ensureSeeded();
    await latency();
    const card = findCard(id);
    card.status = "closed";
    card.closedAt = new Date().toISOString();
    return card;
  },

  async reopenCard(id) {
    ensureSeeded();
    await latency();
    const card = findCard(id);
    card.status = "active";
    card.closedAt = null;
    return card;
  },

  async addBenefit(cardId, input) {
    ensureSeeded();
    await latency();
    findCard(cardId); // 404s if missing
    const benefit: Benefit = {
      id: genId("benefit"),
      cardId,
      name: input.name,
      description: input.description ?? null,
      valueCents: input.valueCents ?? null,
      frequency: input.frequency,
      anchor: input.anchor,
      automatic: input.automatic,
      active: true,
      startDate: input.startDate ?? todayInAppTz(),
      deactivatedAt: null,
      createdAt: new Date().toISOString(),
    };
    mockBenefits.push(benefit);
    return benefit;
  },

  async updateBenefit(id, input, opts) {
    ensureSeeded();
    await latency();
    const benefit = findBenefit(id);
    const hasUsage = mockUsage.some((u) => u.benefitId === id);
    const changingShape =
      input.frequency !== benefit.frequency || input.anchor !== benefit.anchor;
    if (changingShape && hasUsage && !opts?.force) {
      throw new ApiClientError(409, {
        error: "Changing frequency or anchor conflicts with existing usage history.",
        code: "frequency_change_conflict",
      });
    }
    benefit.name = input.name;
    benefit.description = input.description ?? null;
    benefit.valueCents = input.valueCents ?? null;
    benefit.frequency = input.frequency;
    benefit.anchor = input.anchor;
    benefit.automatic = input.automatic;
    if (input.startDate) benefit.startDate = input.startDate;
    return benefit;
  },

  async deactivateBenefit(id) {
    ensureSeeded();
    await latency();
    const benefit = findBenefit(id);
    benefit.active = false;
    benefit.deactivatedAt = new Date().toISOString();
    return benefit;
  },

  async reactivateBenefit(id) {
    ensureSeeded();
    await latency();
    const benefit = findBenefit(id);
    benefit.active = true;
    benefit.deactivatedAt = null;
    return benefit;
  },

  async setUsage(benefitId, cycleKey, update) {
    ensureSeeded();
    await latency();
    findBenefit(benefitId); // 404s if missing
    let row = mockUsage.find(
      (u) => u.benefitId === benefitId && u.cycleKey === cycleKey,
    );
    if (!row) {
      row = {
        id: genId("usage"),
        benefitId,
        cycleKey,
        used: null,
        comment: null,
        updatedAt: new Date().toISOString(),
      };
      mockUsage.push(row);
    }
    if (update.used !== undefined) row.used = update.used;
    if (update.comment !== undefined) row.comment = update.comment;
    row.updatedAt = new Date().toISOString();
    return row;
  },

  async getHistory(benefitId, limit = DEFAULT_HISTORY_LIMIT) {
    ensureSeeded();
    await latency();
    const benefit = findBenefit(benefitId);
    const card = findCard(benefit.cardId);
    const today = todayInAppTz();
    const windows = previousCycles(benefit, card, today, limit);
    const cycles: HistoryCycle[] = windows.map((window, i) => {
      const missed = i % 3 === 0 && !benefit.automatic;
      return {
        window,
        effectiveUsed: !missed,
        explicit: !missed,
        comment: i === 1 ? "Redeemed for a weekend trip." : null,
      };
    });
    return { benefitId, cycles };
  },

  async parseText(text) {
    ensureSeeded();
    await latency(900, 1700);
    return {
      card: {
        name: "New Card",
        issuer: null,
        annual_fee_cents: null,
        anniversary_date: null,
      },
      benefits: [
        {
          name: "Sample Credit",
          description: text.trim().slice(0, 140) || "Parsed from your description.",
          value_cents: 10_000,
          frequency: "quarterly",
          anchor: "calendar",
          automatic: false,
          confidence: "medium",
        },
      ],
      notes:
        "Mock parse result — connect the Worker (unset VITE_USE_MOCK) for real AI parsing.",
    };
  },

  async importCard(payload) {
    ensureSeeded();
    await latency();
    const today = todayInAppTz();
    const card: Card = {
      id: genId("card"),
      name: payload.card.name,
      issuer: payload.card.issuer ?? null,
      annualFeeCents: payload.card.annualFeeCents,
      anniversaryDate: payload.card.anniversaryDate,
      status: "active",
      closedAt: null,
      createdAt: new Date().toISOString(),
    };
    mockCards.push(card);
    const benefits = payload.benefits.map((b) => {
      const benefit: Benefit = {
        id: genId("benefit"),
        cardId: card.id,
        name: b.name,
        description: b.description ?? null,
        valueCents: b.valueCents ?? null,
        frequency: b.frequency,
        anchor: b.anchor,
        automatic: b.automatic,
        active: true,
        startDate: b.startDate ?? today,
        deactivatedAt: null,
        createdAt: new Date().toISOString(),
      };
      mockBenefits.push(benefit);
      return benefit;
    });
    return { card, benefits };
  },

  async login() {
    await latency();
    // Mock mode never requires auth — always "succeeds".
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const api: ApiClient =
  import.meta.env.VITE_USE_MOCK === "1" ? mockApi : realApi;
