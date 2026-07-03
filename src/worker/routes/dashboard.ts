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
 */
import { Hono } from "hono";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// TODO(Phase B): implement per contract above.

export default app;
