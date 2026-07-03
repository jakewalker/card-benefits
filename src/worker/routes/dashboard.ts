/**
 * Dashboard route. Owned by Phase B.
 *
 * CONTRACT (paths are relative to /api):
 *   GET /dashboard → DashboardPayload
 *     Load active cards + active benefits + usage rows for each benefit's
 *     CURRENT cycle key, then delegate entirely to shared computeDashboard().
 *
 * "Today": use todayInAppTz(), EXCEPT honor the X-Debug-Today header
 * (YYYY-MM-DD) when import.meta.env.DEV is true — never in production.
 * Put this in a small helper (e.g. resolveToday(c)) since usage.ts needs it too.
 *
 * Kept to 3 DB round trips: cards, benefits (joined to active cards), usage
 * (all rows for those benefit ids — computeDashboard matches by benefitId +
 * current cycle key itself, so no per-benefit cycle-key filtering is needed
 * server-side).
 */
import { Hono } from "hono";
import type { AppEnv } from "../index";
import { listActiveBenefitsForActiveCards, listCards, listUsageForBenefitIds } from "../db";
import { resolveToday } from "../today";
import { computeDashboard } from "../../shared/dashboard";

const app = new Hono<AppEnv>();

app.get("/dashboard", async (c) => {
  const today = resolveToday(c);
  const cards = await listCards(c.env.DB, false);
  const benefits = await listActiveBenefitsForActiveCards(c.env.DB);
  const usage = await listUsageForBenefitIds(
    c.env.DB,
    benefits.map((b) => b.id),
  );

  const payload = computeDashboard(cards, benefits, usage, today);
  return c.json(payload);
});

export default app;
