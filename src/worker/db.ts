/**
 * All SQL for the app lives here as plain strings — portable SQLite (see
 * migrations/0001_init.sql). The ONLY D1-specific call anywhere in this file
 * (and the app) is `db.batch()`, used for the atomic card+benefits import.
 *
 * DB rows are snake_case with INTEGER booleans (0/1) and nullable columns
 * exactly as declared in the migration. This module exports:
 *   - row -> entity mappers (cardFromRow / benefitFromRow / usageFromRow)
 *   - typed query/mutation functions used by the route modules
 *
 * Row shaping / entity conversion happens here; cycle math, validation, and
 * HTTP concerns stay in the route files.
 */
import type {
  Anchor,
  Benefit,
  Card,
  Category,
  Frequency,
  ImportPayload,
  ISODate,
  UsageRow,
  UsageUpdate,
} from "../shared/types";

// ---------------------------------------------------------------------------
// DB row shapes (snake_case, matches migrations/0001_init.sql exactly)
// ---------------------------------------------------------------------------

interface CardRowDb {
  id: string;
  name: string;
  issuer: string | null;
  annual_fee_cents: number;
  anniversary_date: string;
  status: string;
  closed_at: string | null;
  created_at: string;
}

interface BenefitRowDb {
  id: string;
  card_id: string;
  name: string;
  description: string | null;
  value_cents: number | null;
  frequency: string;
  anchor: string;
  category: string;
  automatic: number;
  active: number;
  start_date: string;
  deactivated_at: string | null;
  created_at: string;
}

interface UsageRowDb {
  id: string;
  benefit_id: string;
  cycle_key: string;
  used: number | null;
  comment: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function cardFromRow(row: CardRowDb): Card {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    annualFeeCents: row.annual_fee_cents,
    anniversaryDate: row.anniversary_date,
    status: row.status === "closed" ? "closed" : "active",
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}

export function benefitFromRow(row: BenefitRowDb): Benefit {
  return {
    id: row.id,
    cardId: row.card_id,
    name: row.name,
    description: row.description,
    valueCents: row.value_cents,
    frequency: row.frequency as Frequency,
    anchor: row.anchor as Anchor,
    category: row.category as Category,
    automatic: row.automatic === 1,
    active: row.active === 1,
    startDate: row.start_date,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
  };
}

export function usageFromRow(row: UsageRowDb): UsageRow {
  return {
    id: row.id,
    benefitId: row.benefit_id,
    cycleKey: row.cycle_key,
    used: row.used === null ? null : row.used === 1,
    comment: row.comment,
    updatedAt: row.updated_at,
  };
}

function boolToDb(v: boolean | null): number | null {
  return v === null ? null : v ? 1 : 0;
}

/** Builds a `?,?,?` placeholder list for a dynamic-length IN clause. */
function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export interface CardWriteFields {
  name: string;
  issuer: string | null;
  annualFeeCents: number;
  anniversaryDate: ISODate;
}

export async function listCards(
  db: D1Database,
  includeClosed: boolean,
): Promise<Card[]> {
  const sql = includeClosed
    ? `SELECT * FROM cards ORDER BY name COLLATE NOCASE ASC`
    : `SELECT * FROM cards WHERE status = 'active' ORDER BY name COLLATE NOCASE ASC`;
  const result = await db.prepare(sql).all<CardRowDb>();
  return result.results.map(cardFromRow);
}

export async function getCardById(
  db: D1Database,
  id: string,
): Promise<Card | null> {
  const row = await db
    .prepare(`SELECT * FROM cards WHERE id = ?`)
    .bind(id)
    .first<CardRowDb>();
  return row ? cardFromRow(row) : null;
}

export async function insertCard(
  db: D1Database,
  fields: CardWriteFields,
  now: string,
): Promise<Card> {
  const id = crypto.randomUUID();
  const row = await db
    .prepare(
      `INSERT INTO cards (id, name, issuer, annual_fee_cents, anniversary_date, status, closed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', NULL, ?)
       RETURNING *`,
    )
    .bind(
      id,
      fields.name,
      fields.issuer,
      fields.annualFeeCents,
      fields.anniversaryDate,
      now,
    )
    .first<CardRowDb>();
  if (!row) throw new Error("insertCard: RETURNING produced no row");
  return cardFromRow(row);
}

export async function updateCardRow(
  db: D1Database,
  id: string,
  fields: CardWriteFields,
): Promise<Card | null> {
  const row = await db
    .prepare(
      `UPDATE cards
       SET name = ?, issuer = ?, annual_fee_cents = ?, anniversary_date = ?
       WHERE id = ?
       RETURNING *`,
    )
    .bind(
      fields.name,
      fields.issuer,
      fields.annualFeeCents,
      fields.anniversaryDate,
      id,
    )
    .first<CardRowDb>();
  return row ? cardFromRow(row) : null;
}

export async function closeCardRow(
  db: D1Database,
  id: string,
  now: string,
): Promise<Card | null> {
  const row = await db
    .prepare(
      `UPDATE cards SET status = 'closed', closed_at = ? WHERE id = ? RETURNING *`,
    )
    .bind(now, id)
    .first<CardRowDb>();
  return row ? cardFromRow(row) : null;
}

export async function reopenCardRow(
  db: D1Database,
  id: string,
): Promise<Card | null> {
  const row = await db
    .prepare(
      `UPDATE cards SET status = 'active', closed_at = NULL WHERE id = ? RETURNING *`,
    )
    .bind(id)
    .first<CardRowDb>();
  return row ? cardFromRow(row) : null;
}

// ---------------------------------------------------------------------------
// Benefits
// ---------------------------------------------------------------------------

export interface BenefitWriteFields {
  name: string;
  description: string | null;
  valueCents: number | null;
  frequency: Frequency;
  anchor: Anchor;
  category: Category;
  automatic: boolean;
  startDate: ISODate;
}

/** All benefits (active + inactive) for one card, for the card-detail page. */
export async function listBenefitsByCard(
  db: D1Database,
  cardId: string,
): Promise<Benefit[]> {
  const result = await db
    .prepare(`SELECT * FROM benefits WHERE card_id = ? ORDER BY created_at ASC`)
    .bind(cardId)
    .all<BenefitRowDb>();
  return result.results.map(benefitFromRow);
}

/** Active benefits belonging to any of the given cards (open or closed). */
export async function listActiveBenefitsForCardIds(
  db: D1Database,
  cardIds: string[],
): Promise<Benefit[]> {
  if (cardIds.length === 0) return [];
  const sql = `SELECT * FROM benefits WHERE active = 1 AND card_id IN (${placeholders(cardIds.length)})`;
  const result = await db
    .prepare(sql)
    .bind(...cardIds)
    .all<BenefitRowDb>();
  return result.results.map(benefitFromRow);
}

/** Active benefits of active cards only — the dashboard's data set. */
export async function listActiveBenefitsForActiveCards(
  db: D1Database,
): Promise<Benefit[]> {
  const result = await db
    .prepare(
      `SELECT b.* FROM benefits b
       JOIN cards c ON c.id = b.card_id
       WHERE b.active = 1 AND c.status = 'active'`,
    )
    .all<BenefitRowDb>();
  return result.results.map(benefitFromRow);
}

export async function getBenefitById(
  db: D1Database,
  id: string,
): Promise<Benefit | null> {
  const row = await db
    .prepare(`SELECT * FROM benefits WHERE id = ?`)
    .bind(id)
    .first<BenefitRowDb>();
  return row ? benefitFromRow(row) : null;
}

export async function insertBenefit(
  db: D1Database,
  cardId: string,
  fields: BenefitWriteFields,
  now: string,
): Promise<Benefit> {
  const id = crypto.randomUUID();
  const row = await db
    .prepare(
      `INSERT INTO benefits (id, card_id, name, description, value_cents, frequency, anchor, category, automatic, active, start_date, deactivated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)
       RETURNING *`,
    )
    .bind(
      id,
      cardId,
      fields.name,
      fields.description,
      fields.valueCents,
      fields.frequency,
      fields.anchor,
      fields.category,
      fields.automatic ? 1 : 0,
      fields.startDate,
      now,
    )
    .first<BenefitRowDb>();
  if (!row) throw new Error("insertBenefit: RETURNING produced no row");
  return benefitFromRow(row);
}

export async function updateBenefitRow(
  db: D1Database,
  id: string,
  fields: BenefitWriteFields,
): Promise<Benefit | null> {
  const row = await db
    .prepare(
      `UPDATE benefits
       SET name = ?, description = ?, value_cents = ?, frequency = ?, anchor = ?, category = ?, automatic = ?, start_date = ?
       WHERE id = ?
       RETURNING *`,
    )
    .bind(
      fields.name,
      fields.description,
      fields.valueCents,
      fields.frequency,
      fields.anchor,
      fields.category,
      fields.automatic ? 1 : 0,
      fields.startDate,
      id,
    )
    .first<BenefitRowDb>();
  return row ? benefitFromRow(row) : null;
}

export async function deactivateBenefitRow(
  db: D1Database,
  id: string,
  now: string,
): Promise<Benefit | null> {
  const row = await db
    .prepare(
      `UPDATE benefits SET active = 0, deactivated_at = ? WHERE id = ? RETURNING *`,
    )
    .bind(now, id)
    .first<BenefitRowDb>();
  return row ? benefitFromRow(row) : null;
}

export async function reactivateBenefitRow(
  db: D1Database,
  id: string,
): Promise<Benefit | null> {
  const row = await db
    .prepare(
      `UPDATE benefits SET active = 1, deactivated_at = NULL WHERE id = ? RETURNING *`,
    )
    .bind(id)
    .first<BenefitRowDb>();
  return row ? benefitFromRow(row) : null;
}

/** Whether any usage rows (any cycle) exist for this benefit. */
export async function benefitHasUsageRows(
  db: D1Database,
  benefitId: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS present FROM benefit_usage WHERE benefit_id = ? LIMIT 1`)
    .bind(benefitId)
    .first<{ present: number }>();
  return row !== null;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export async function getUsageRow(
  db: D1Database,
  benefitId: string,
  cycleKey: string,
): Promise<UsageRow | null> {
  const row = await db
    .prepare(`SELECT * FROM benefit_usage WHERE benefit_id = ? AND cycle_key = ?`)
    .bind(benefitId, cycleKey)
    .first<UsageRowDb>();
  return row ? usageFromRow(row) : null;
}

export async function listUsageByBenefit(
  db: D1Database,
  benefitId: string,
): Promise<UsageRow[]> {
  const result = await db
    .prepare(`SELECT * FROM benefit_usage WHERE benefit_id = ?`)
    .bind(benefitId)
    .all<UsageRowDb>();
  return result.results.map(usageFromRow);
}

export async function listUsageForBenefitIds(
  db: D1Database,
  benefitIds: string[],
): Promise<UsageRow[]> {
  if (benefitIds.length === 0) return [];
  const sql = `SELECT * FROM benefit_usage WHERE benefit_id IN (${placeholders(benefitIds.length)})`;
  const result = await db
    .prepare(sql)
    .bind(...benefitIds)
    .all<UsageRowDb>();
  return result.results.map(usageFromRow);
}

/**
 * Upsert on UNIQUE(benefit_id, cycle_key). Fields omitted from `update`
 * (undefined) are left as whatever is currently stored (or NULL for a brand
 * new row); `null` explicitly clears. Two round trips: a SELECT to compute
 * the merged value (needed because SQL `ON CONFLICT ... DO UPDATE` can't see
 * "omit this field" vs "set it to NULL" on its own), then an
 * INSERT .. ON CONFLICT DO UPDATE .. RETURNING that both writes and returns
 * the final row.
 */
export async function upsertUsageRow(
  db: D1Database,
  benefitId: string,
  cycleKey: string,
  update: UsageUpdate,
  now: string,
): Promise<UsageRow> {
  const existing = await db
    .prepare(`SELECT * FROM benefit_usage WHERE benefit_id = ? AND cycle_key = ?`)
    .bind(benefitId, cycleKey)
    .first<UsageRowDb>();

  const nextUsed =
    update.used !== undefined ? boolToDb(update.used) : (existing?.used ?? null);
  const nextComment =
    update.comment !== undefined ? update.comment : (existing?.comment ?? null);
  const id = existing ? existing.id : crypto.randomUUID();

  const row = await db
    .prepare(
      `INSERT INTO benefit_usage (id, benefit_id, cycle_key, used, comment, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(benefit_id, cycle_key) DO UPDATE SET
         used = excluded.used,
         comment = excluded.comment,
         updated_at = excluded.updated_at
       RETURNING *`,
    )
    .bind(id, benefitId, cycleKey, nextUsed, nextComment, now)
    .first<UsageRowDb>();
  if (!row) throw new Error("upsertUsageRow: RETURNING produced no row");
  return usageFromRow(row);
}

// ---------------------------------------------------------------------------
// Atomic import (POST /api/cards/import) — the one D1-specific call (batch)
// ---------------------------------------------------------------------------

export async function importCardWithBenefits(
  db: D1Database,
  payload: ImportPayload,
  now: string,
  today: ISODate,
): Promise<{ card: Card; benefits: Benefit[] }> {
  const cardId = crypto.randomUUID();
  const card: Card = {
    id: cardId,
    name: payload.card.name,
    issuer: payload.card.issuer ?? null,
    annualFeeCents: payload.card.annualFeeCents,
    anniversaryDate: payload.card.anniversaryDate,
    status: "active",
    closedAt: null,
    createdAt: now,
  };
  const benefits: Benefit[] = payload.benefits.map((b) => ({
    id: crypto.randomUUID(),
    cardId,
    name: b.name,
    description: b.description ?? null,
    valueCents: b.valueCents ?? null,
    frequency: b.frequency,
    anchor: b.anchor,
    category: b.category,
    automatic: b.automatic,
    active: true,
    startDate: b.startDate ?? today,
    deactivatedAt: null,
    createdAt: now,
  }));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO cards (id, name, issuer, annual_fee_cents, anniversary_date, status, closed_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', NULL, ?)`,
      )
      .bind(
        card.id,
        card.name,
        card.issuer,
        card.annualFeeCents,
        card.anniversaryDate,
        card.createdAt,
      ),
    ...benefits.map((b) =>
      db
        .prepare(
          `INSERT INTO benefits (id, card_id, name, description, value_cents, frequency, anchor, category, automatic, active, start_date, deactivated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)`,
        )
        .bind(
          b.id,
          b.cardId,
          b.name,
          b.description,
          b.valueCents,
          b.frequency,
          b.anchor,
          b.category,
          b.automatic ? 1 : 0,
          b.startDate,
          b.createdAt,
        ),
    ),
  ];

  await db.batch(statements);
  return { card, benefits };
}
