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
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// TODO(Phase B): implement per contract above.

export default app;
