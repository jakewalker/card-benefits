/**
 * Worker entry: Hono app assembly. Owned by Phase 0/E (integrator).
 * Route modules are owned by Phase B (cards/benefits/usage/dashboard) and
 * Phase D (parse) — implement inside those files; do not restructure this one.
 */
import { Hono } from "hono";
import { authMiddleware } from "./auth";
import cards from "./routes/cards";
import benefits from "./routes/benefits";
import usage from "./routes/usage";
import dashboard from "./routes/dashboard";
import parse from "./routes/parse";

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  /** 'none' (default; Cloudflare Access in front) or 'password'. */
  AUTH_MODE?: string;
  /** Required when AUTH_MODE=password. */
  APP_PASSWORD?: string;
  ASSETS: Fetcher;
}

export type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);

app.route("/api", dashboard);
app.route("/api", cards);
app.route("/api", benefits);
app.route("/api", usage);
app.route("/api", parse);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: "not found", code: "not_found" }, 404);
  }
  // Non-API paths fall through to static assets (SPA handling in wrangler.jsonc).
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
