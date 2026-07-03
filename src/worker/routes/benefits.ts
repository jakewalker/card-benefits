/**
 * Benefits routes. Owned by Phase B.
 *
 * CONTRACT (paths are relative to /api):
 *   PUT  /benefits/:id  body BenefitInput → Benefit
 *        If frequency or anchor changes AND usage rows exist for the benefit:
 *        409 {code:'frequency_change_conflict'} unless ?force=1 (old usage rows
 *        are kept as opaque history).
 *   POST /benefits/:id/deactivate → Benefit (soft)
 *   POST /benefits/:id/reactivate → Benefit
 *   GET  /benefits/:id/history?limit=12 → HistoryPayload
 *        previousCycles(...) merged with usage rows by cycle key.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ZodError } from "zod";
import type { AppEnv } from "../index";
import {
  benefitHasUsageRows,
  deactivateBenefitRow,
  getBenefitById,
  getCardById,
  listUsageByBenefit,
  reactivateBenefitRow,
  updateBenefitRow,
} from "../db";
import { resolveToday } from "../today";
import { benefitInputSchema, type ApiError, type HistoryCycle, type HistoryPayload } from "../../shared/types";
import { effectiveUsed, previousCycles } from "../../shared/cycles";
import { DEFAULT_HISTORY_LIMIT } from "../../shared/constants";

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

const app = new Hono<AppEnv>();

app.put("/benefits/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await getBenefitById(c.env.DB, id);
  if (!existing) return notFound(c, "benefit not found");

  const body = await c.req.json().catch(() => null);
  const parsed = benefitInputSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const force = c.req.query("force") === "1";
  const frequencyOrAnchorChanged =
    parsed.data.frequency !== existing.frequency || parsed.data.anchor !== existing.anchor;

  if (frequencyOrAnchorChanged && !force) {
    const hasUsage = await benefitHasUsageRows(c.env.DB, id);
    if (hasUsage) {
      return c.json(
        {
          error:
            "changing frequency/anchor conflicts with existing usage history; retry with ?force=1 to proceed",
          code: "frequency_change_conflict",
        } satisfies ApiError,
        409,
      );
    }
  }

  const benefit = await updateBenefitRow(c.env.DB, id, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    valueCents: parsed.data.valueCents ?? null,
    frequency: parsed.data.frequency,
    anchor: parsed.data.anchor,
    category: parsed.data.category,
    automatic: parsed.data.automatic,
    startDate: parsed.data.startDate ?? existing.startDate,
  });
  if (!benefit) return notFound(c, "benefit not found");
  return c.json(benefit);
});

app.post("/benefits/:id/deactivate", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const benefit = await deactivateBenefitRow(c.env.DB, id, now);
  if (!benefit) return notFound(c, "benefit not found");
  return c.json(benefit);
});

app.post("/benefits/:id/reactivate", async (c) => {
  const id = c.req.param("id");
  const benefit = await reactivateBenefitRow(c.env.DB, id);
  if (!benefit) return notFound(c, "benefit not found");
  return c.json(benefit);
});

app.get("/benefits/:id/history", async (c) => {
  const id = c.req.param("id");
  const benefit = await getBenefitById(c.env.DB, id);
  if (!benefit) return notFound(c, "benefit not found");
  const card = await getCardById(c.env.DB, benefit.cardId);
  if (!card) return notFound(c, "card not found");

  const limitParam = c.req.query("limit");
  const parsedLimit = limitParam !== undefined ? Number(limitParam) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : DEFAULT_HISTORY_LIMIT;

  const today = resolveToday(c);
  const windows = previousCycles(benefit, card, today, limit);
  const usageRows = await listUsageByBenefit(c.env.DB, id);
  const usageIndex = new Map(usageRows.map((row) => [row.cycleKey, row]));

  const cycles: HistoryCycle[] = windows.map((window) => {
    const row = usageIndex.get(window.key) ?? null;
    return {
      window,
      effectiveUsed: effectiveUsed(benefit, row),
      explicit: row !== null && row.used !== null,
      comment: row?.comment ?? null,
    };
  });

  const payload: HistoryPayload = { benefitId: id, cycles };
  return c.json(payload);
});

export default app;
