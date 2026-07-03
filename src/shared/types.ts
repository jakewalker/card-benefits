/**
 * THE CONTRACT FILE.
 *
 * Every phase (cycle math, worker API, frontend, AI parse) builds against the
 * types and zod schemas here. Do not change signatures/shapes without
 * coordinating with the integrator — additive changes only.
 *
 * Conventions:
 * - App-internal DTOs are camelCase.
 * - The AI parse payload (ParsedCardPayload) is snake_case because it mirrors
 *   the JSON schema sent to the Claude API verbatim.
 * - All dates are ISO 'YYYY-MM-DD' strings (ISODate). Timestamps are ISO 8601.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Calendar date string 'YYYY-MM-DD' (no time, no timezone). */
export type ISODate = string;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const frequencySchema = z.enum([
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);
export type Frequency = z.infer<typeof frequencySchema>;

export const anchorSchema = z.enum(["calendar", "anniversary"]);
export type Anchor = z.infer<typeof anchorSchema>;

/** Display grouping for benefits. Labels/icons live in constants.CATEGORY_META. */
export const categorySchema = z.enum([
  "dining",
  "hotels",
  "travel",
  "shopping",
  "entertainment",
  "other",
]);
export type Category = z.infer<typeof categorySchema>;

/** One benefit cycle. `end` is INCLUSIVE (the last day the benefit is usable). */
export interface CycleWindow {
  key: string;
  start: ISODate;
  end: ISODate;
}

// ---------------------------------------------------------------------------
// Entities (as returned by the API; DB rows are snake_case, mapped in worker/db.ts)
// ---------------------------------------------------------------------------

export interface Card {
  id: string;
  name: string;
  issuer: string | null;
  annualFeeCents: number;
  anniversaryDate: ISODate;
  status: "active" | "closed";
  closedAt: string | null;
  createdAt: string;
}

export interface Benefit {
  id: string;
  cardId: string;
  name: string;
  description: string | null;
  /** Display only ("$15 Uber Cash") — never used for math. */
  valueCents: number | null;
  frequency: Frequency;
  anchor: Anchor;
  category: Category;
  /** true = posts automatically; treated as used unless explicitly unchecked. */
  automatic: boolean;
  active: boolean;
  /** Clamps history enumeration; defaults server-side to the day it was added. */
  startDate: ISODate;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface UsageRow {
  id: string;
  benefitId: string;
  cycleKey: string;
  /** null = inherit default (benefit.automatic); true/false = explicit. */
  used: boolean | null;
  comment: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Write-side input schemas (validated in worker routes AND client forms)
// ---------------------------------------------------------------------------

export const cardInputSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1).nullish(),
  annualFeeCents: z.number().int().min(0),
  anniversaryDate: isoDateSchema,
});
export type CardInput = z.infer<typeof cardInputSchema>;

export const benefitInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  valueCents: z.number().int().min(0).nullish(),
  frequency: frequencySchema,
  anchor: anchorSchema,
  category: categorySchema.default("other"),
  automatic: z.boolean().default(false),
  /** Optional; server defaults to today (app TZ). */
  startDate: isoDateSchema.optional(),
});
export type BenefitInput = z.infer<typeof benefitInputSchema>;

/**
 * Upsert body for PUT /api/benefits/:id/usage/:cycleKey.
 * - used: true/false sets explicit state; null clears back to default; omitted = leave as-is.
 * - comment: string sets; null clears; omitted = leave as-is.
 * At least one of the two must be present.
 */
export const usageUpdateSchema = z
  .object({
    used: z.boolean().nullable().optional(),
    comment: z.string().nullable().optional(),
  })
  .refine((v) => v.used !== undefined || v.comment !== undefined, {
    message: "provide at least one of: used, comment",
  });
export type UsageUpdate = z.infer<typeof usageUpdateSchema>;

/** Atomic card+benefits creation (POST /api/cards/import). */
export const importPayloadSchema = z.object({
  card: cardInputSchema,
  benefits: z.array(benefitInputSchema),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

// ---------------------------------------------------------------------------
// AI parse payload (snake_case — mirrors the JSON schema given to Claude)
// ---------------------------------------------------------------------------

export const parsedBenefitSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  value_cents: z.number().int().nullable(),
  frequency: frequencySchema,
  anchor: anchorSchema,
  category: categorySchema,
  automatic: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ParsedBenefit = z.infer<typeof parsedBenefitSchema>;

export const parsedCardPayloadSchema = z.object({
  card: z.object({
    name: z.string(),
    issuer: z.string().nullable(),
    annual_fee_cents: z.number().int().nullable(),
    /** Usually null — the model rarely knows the anniversary; user fills it in review. */
    anniversary_date: z.string().nullable(),
  }),
  benefits: z.array(parsedBenefitSchema),
  /** Caveats/ambiguities the model wants to surface to the user. */
  notes: z.string().nullable(),
});
export type ParsedCardPayload = z.infer<typeof parsedCardPayloadSchema>;

export const parseRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
});
export type ParseRequest = z.infer<typeof parseRequestSchema>;

// ---------------------------------------------------------------------------
// Read-side payloads
// ---------------------------------------------------------------------------

export interface BenefitStatus {
  window: CycleWindow;
  daysRemaining: number;
  /** row.used ?? benefit.automatic */
  effectiveUsed: boolean;
  /** true when a usage row with non-null `used` exists for the current cycle. */
  explicit: boolean;
  comment: string | null;
  expiringSoon: boolean;
}

export interface BenefitWithStatus extends Benefit {
  status: BenefitStatus;
}

export interface CardListItem extends Card {
  benefitCount: number;
  /** Active, non-effectively-used benefits in their current cycle. */
  unusedCount: number;
}

export interface CardDetailPayload {
  card: Card;
  benefits: BenefitWithStatus[];
}

export interface HistoryCycle {
  window: CycleWindow;
  effectiveUsed: boolean;
  explicit: boolean;
  comment: string | null;
}

export interface HistoryPayload {
  benefitId: string;
  cycles: HistoryCycle[]; // newest first, excludes current cycle
}

export interface DashboardItem {
  kind: "benefit" | "annual_fee";
  cardId: string;
  cardName: string;
  /** Present when kind === 'benefit'. */
  benefitId?: string;
  name: string;
  /** For annual_fee items this is the fee amount. */
  valueCents: number | null;
  /** 'other' for annual_fee items. */
  category: Category;
  window: CycleWindow;
  daysRemaining: number;
  effectiveUsed: boolean;
  explicit: boolean;
  automatic: boolean;
  comment: string | null;
}

export interface DashboardPayload {
  today: ISODate;
  /**
   * Not effectively used AND within warn threshold. Includes annual_fee items
   * within FEE_WARN_DAYS. Sorted by (daysRemaining asc, valueCents desc, name).
   */
  expiringSoon: DashboardItem[];
  /** Every active benefit of every active card, current cycle. Grouped client-side by card. */
  current: DashboardItem[];
  /** One annual_fee item per active card with annualFeeCents > 0, sorted by daysRemaining. */
  feeRenewals: DashboardItem[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** All non-2xx API responses use this body. */
export interface ApiError {
  error: string;
  /** Machine-readable code, e.g. 'not_found', 'validation', 'frequency_change_conflict', 'ai_unavailable'. */
  code?: string;
}
