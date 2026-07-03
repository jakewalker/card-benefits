/**
 * Dashboard computation — pure over full data snapshots so a future email
 * digest (Cloudflare Cron Trigger) can reuse it verbatim.
 *
 * CONTRACT (Phase 0 stub — implemented in Phase A; signature is frozen).
 *
 * Rules:
 * - Only ACTIVE cards and ACTIVE benefits are considered.
 * - `current`: one DashboardItem per active benefit (current cycle), with
 *   effectiveUsed/explicit/comment resolved from the matching usage row
 *   (benefitId + current cycle key).
 * - `feeRenewals`: one 'annual_fee' item per active card with
 *   annualFeeCents > 0, window = feeRenewalCycle(card, today), sorted by
 *   daysRemaining asc. name = "Annual fee", valueCents = annualFeeCents,
 *   automatic = false, effectiveUsed = false, comment = null.
 * - `expiringSoon`: benefit items where effectiveUsed === false AND
 *   isExpiringSoon(...), PLUS fee items with daysRemaining <= FEE_WARN_DAYS.
 *   (Automatic benefits only appear here if explicitly unchecked.) Sorted by
 *   (daysRemaining asc, valueCents desc with nulls last, name asc).
 */
import type {
  Benefit,
  Card,
  DashboardPayload,
  ISODate,
  UsageRow,
} from "./types";

export function computeDashboard(
  cards: Card[],
  benefits: Benefit[],
  usage: UsageRow[],
  today: ISODate,
): DashboardPayload {
  void cards, benefits, usage, today;
  throw new Error("unimplemented (Phase A)");
}
