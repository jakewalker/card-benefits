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
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// TODO(Phase B): implement per contract above.

export default app;
