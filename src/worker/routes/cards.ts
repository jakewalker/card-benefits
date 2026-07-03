/**
 * Cards routes. Owned by Phase B.
 *
 * CONTRACT (paths are relative to /api):
 *   GET    /cards?includeClosed=1     → CardListItem[]
 *   POST   /cards        body CardInput → Card (201)
 *   GET    /cards/:id                 → CardDetailPayload
 *   PUT    /cards/:id    body CardInput → Card
 *   POST   /cards/:id/close           → Card (soft close)
 *   POST   /cards/:id/reopen          → Card
 *   POST   /cards/:id/benefits body BenefitInput → Benefit (201)
 *   POST   /cards/import body ImportPayload → { card: Card, benefits: Benefit[] } (201, atomic db.batch)
 * Errors: 404 {code:'not_found'}, 400 {code:'validation'} per ApiError.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ZodError } from "zod";
import type { AppEnv } from "../index";
import {
  closeCardRow,
  getCardById,
  importCardWithBenefits,
  insertBenefit,
  insertCard,
  listActiveBenefitsForCardIds,
  listBenefitsByCard,
  listCards,
  listUsageForBenefitIds,
  reopenCardRow,
  updateCardRow,
} from "../db";
import { resolveToday } from "../today";
import {
  benefitInputSchema,
  cardInputSchema,
  importPayloadSchema,
  type ApiError,
  type CardDetailPayload,
  type CardListItem,
  type UsageRow as UsageRowEntity,
} from "../../shared/types";
import { currentCycle, effectiveUsed, daysRemaining, isExpiringSoon } from "../../shared/cycles";
import type { Benefit } from "../../shared/types";

function notFound(c: Context<AppEnv>, message: string) {
  return c.json({ error: message, code: "not_found" } satisfies ApiError, 404);
}

function validationError(c: Context<AppEnv>, error: ZodError) {
  return c.json(
    {
      error: error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
      code: "validation",
    } satisfies ApiError,
    400,
  );
}

function usageKey(benefitId: string, cycleKey: string): string {
  return `${benefitId}|${cycleKey}`;
}

const app = new Hono<AppEnv>();

app.get("/cards", async (c) => {
  const includeClosed = c.req.query("includeClosed") === "1";
  const cards = await listCards(c.env.DB, includeClosed);
  if (cards.length === 0) {
    return c.json([] satisfies CardListItem[]);
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const benefits = await listActiveBenefitsForCardIds(
    c.env.DB,
    cards.map((card) => card.id),
  );
  const benefitIds = benefits.map((b) => b.id);
  const usageRows = await listUsageForBenefitIds(c.env.DB, benefitIds);
  const usageIndex = new Map<string, UsageRowEntity>();
  for (const row of usageRows) {
    usageIndex.set(usageKey(row.benefitId, row.cycleKey), row);
  }

  const today = resolveToday(c);
  const counts = new Map<string, { benefitCount: number; unusedCount: number }>();
  for (const card of cards) counts.set(card.id, { benefitCount: 0, unusedCount: 0 });

  for (const benefit of benefits) {
    const card = cardById.get(benefit.cardId);
    if (!card) continue;
    const entry = counts.get(card.id);
    if (!entry) continue;
    entry.benefitCount += 1;
    const window = currentCycle(benefit, card, today);
    const row = usageIndex.get(usageKey(benefit.id, window.key)) ?? null;
    if (!effectiveUsed(benefit, row)) {
      entry.unusedCount += 1;
    }
  }

  const items: CardListItem[] = cards.map((card) => {
    const entry = counts.get(card.id);
    return {
      ...card,
      benefitCount: entry?.benefitCount ?? 0,
      unusedCount: entry?.unusedCount ?? 0,
    };
  });
  return c.json(items);
});

app.post("/cards", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = cardInputSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const now = new Date().toISOString();
  const card = await insertCard(
    c.env.DB,
    {
      name: parsed.data.name,
      issuer: parsed.data.issuer ?? null,
      annualFeeCents: parsed.data.annualFeeCents,
      anniversaryDate: parsed.data.anniversaryDate,
    },
    now,
  );
  return c.json(card, 201);
});

// POST /cards/import must be registered before /cards/:id/* so "import" isn't
// captured as an :id param.
app.post("/cards/import", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const now = new Date().toISOString();
  const today = resolveToday(c);
  const result = await importCardWithBenefits(c.env.DB, parsed.data, now, today);
  return c.json(result, 201);
});

app.get("/cards/:id", async (c) => {
  const id = c.req.param("id");
  const card = await getCardById(c.env.DB, id);
  if (!card) return notFound(c, "card not found");

  const benefits: Benefit[] = await listBenefitsByCard(c.env.DB, id);
  const benefitIds = benefits.map((b) => b.id);
  const usageRows = await listUsageForBenefitIds(c.env.DB, benefitIds);
  const usageIndex = new Map<string, UsageRowEntity>();
  for (const row of usageRows) {
    usageIndex.set(usageKey(row.benefitId, row.cycleKey), row);
  }

  const today = resolveToday(c);
  const benefitsWithStatus = benefits.map((benefit) => {
    const window = currentCycle(benefit, card, today);
    const row = usageIndex.get(usageKey(benefit.id, window.key)) ?? null;
    const used = effectiveUsed(benefit, row);
    const explicit = row !== null && row.used !== null;
    const expiring =
      benefit.active && !used && isExpiringSoon(window, benefit.frequency, today);
    return {
      ...benefit,
      status: {
        window,
        daysRemaining: daysRemaining(window, today),
        effectiveUsed: used,
        explicit,
        comment: row?.comment ?? null,
        expiringSoon: expiring,
      },
    };
  });

  const payload: CardDetailPayload = { card, benefits: benefitsWithStatus };
  return c.json(payload);
});

app.put("/cards/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = cardInputSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const card = await updateCardRow(c.env.DB, id, {
    name: parsed.data.name,
    issuer: parsed.data.issuer ?? null,
    annualFeeCents: parsed.data.annualFeeCents,
    anniversaryDate: parsed.data.anniversaryDate,
  });
  if (!card) return notFound(c, "card not found");
  return c.json(card);
});

app.post("/cards/:id/close", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const card = await closeCardRow(c.env.DB, id, now);
  if (!card) return notFound(c, "card not found");
  return c.json(card);
});

app.post("/cards/:id/reopen", async (c) => {
  const id = c.req.param("id");
  const card = await reopenCardRow(c.env.DB, id);
  if (!card) return notFound(c, "card not found");
  return c.json(card);
});

app.post("/cards/:id/benefits", async (c) => {
  const cardId = c.req.param("id");
  const card = await getCardById(c.env.DB, cardId);
  if (!card) return notFound(c, "card not found");

  const body = await c.req.json().catch(() => null);
  const parsed = benefitInputSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const today = resolveToday(c);
  const now = new Date().toISOString();
  const benefit = await insertBenefit(
    c.env.DB,
    cardId,
    {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      valueCents: parsed.data.valueCents ?? null,
      frequency: parsed.data.frequency,
      anchor: parsed.data.anchor,
      automatic: parsed.data.automatic,
      startDate: parsed.data.startDate ?? today,
    },
    now,
  );
  return c.json(benefit, 201);
});

export default app;
