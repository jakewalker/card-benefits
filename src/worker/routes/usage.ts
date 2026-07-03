/**
 * Usage upsert route. Owned by Phase B.
 *
 * CONTRACT (paths are relative to /api):
 *   PUT /benefits/:id/usage/:cycleKey  body UsageUpdate → UsageRow
 *     - Validate cycleKey via cycleWindowForKey(benefit, card, key); the window
 *       must not start after today and must not end before benefit.startDate;
 *       otherwise 400 {code:'invalid_cycle_key'}.
 *     - Upsert on UNIQUE(benefit_id, cycle_key). Omitted fields left as-is;
 *       used:null clears explicit state; comment:null clears comment.
 *     - If the resulting row is (used IS NULL AND comment IS NULL), it may be
 *       deleted or kept — either is acceptable; response then reflects defaults.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ZodError } from "zod";
import type { AppEnv } from "../index";
import { getBenefitById, getCardById, upsertUsageRow } from "../db";
import { resolveToday } from "../today";
import { usageUpdateSchema, type ApiError } from "../../shared/types";
import { cycleWindowForKey } from "../../shared/cycles";
import { cmpDate } from "../../shared/dates";

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

app.put("/benefits/:id/usage/:cycleKey", async (c) => {
  const id = c.req.param("id");
  const cycleKey = c.req.param("cycleKey");

  const benefit = await getBenefitById(c.env.DB, id);
  if (!benefit) return notFound(c, "benefit not found");
  const card = await getCardById(c.env.DB, benefit.cardId);
  if (!card) return notFound(c, "card not found");

  const today = resolveToday(c);
  const window = cycleWindowForKey(benefit, card, cycleKey);
  const invalid =
    window === null ||
    cmpDate(window.start, today) > 0 ||
    cmpDate(window.end, benefit.startDate) < 0;
  if (invalid) {
    return c.json(
      { error: "invalid or out-of-range cycle key", code: "invalid_cycle_key" } satisfies ApiError,
      400,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = usageUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const now = new Date().toISOString();
  const row = await upsertUsageRow(c.env.DB, id, cycleKey, parsed.data, now);
  return c.json(row);
});

export default app;
