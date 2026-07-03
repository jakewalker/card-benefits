/**
 * AI parse route. Owned by Phase D.
 *
 * CONTRACT (paths are relative to /api):
 *   POST /parse  body ParseRequest {text} → ParsedCardPayload
 *     - Never writes to the database.
 *     - Delegates to ../ai.ts (Claude call + zod re-validation).
 *     - Error mapping: Anthropic RateLimitError → 503 {code:'ai_rate_limited'};
 *       other Anthropic APIError → 502 {code:'ai_unavailable'};
 *       ZodError on model output → 502 {code:'ai_bad_output'}.
 */
import { Hono } from "hono";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// TODO(Phase D): implement per contract above.

export default app;
