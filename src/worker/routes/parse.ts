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
import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import type { AppEnv } from "../index";
import { parseRequestSchema } from "../../shared/types";
import { todayInAppTz } from "../../shared/dates";
import { parseCardDescription } from "../ai";

const app = new Hono<AppEnv>();

app.post("/parse", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid request body", code: "validation" }, 400);
  }

  // todayInAppTz() is implemented concurrently (Phase A) and currently throws;
  // fall back to a UTC date so this route works standalone until it lands.
  let today: string;
  try {
    today = todayInAppTz();
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }

  try {
    const payload = await parseCardDescription(
      c.env.ANTHROPIC_API_KEY,
      parsed.data.text,
      today,
    );
    return c.json(payload);
  } catch (err) {
    // Most-specific first.
    if (err instanceof Anthropic.RateLimitError) {
      return c.json(
        { error: "AI is rate-limited, try again shortly", code: "ai_rate_limited" },
        503,
      );
    }
    if (err instanceof Anthropic.APIError) {
      return c.json({ error: "AI service is unavailable", code: "ai_unavailable" }, 502);
    }
    if (err instanceof ZodError || err instanceof SyntaxError) {
      return c.json(
        { error: "AI returned unexpected output", code: "ai_bad_output" },
        502,
      );
    }
    throw err;
  }
});

export default app;
