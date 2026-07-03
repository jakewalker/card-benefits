/**
 * Auth middleware + login route. Owned by Phase B.
 *
 * CONTRACT:
 * - AUTH_MODE unset or 'none' → middleware is a passthrough (Cloudflare Access
 *   fronts the app) and POST /login returns 204 (no-op).
 * - AUTH_MODE='password':
 *   - POST /login {password} compares against env.APP_PASSWORD; on success
 *     sets an HttpOnly, Secure, SameSite=Lax cookie holding an HMAC-signed
 *     token (WebCrypto HMAC-SHA-256, key derived from APP_PASSWORD),
 *     expiry ~180 days encoded in the signed payload. Wrong password → 401.
 *   - authMiddleware SKIPS the /api/login path; every other /api/* request
 *     without a valid cookie → 401 {error, code:'unauthorized'} (ApiError).
 *
 * Both exports are already mounted in index.ts — implement here only.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./index";

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  // TODO(Phase B): implement per contract above.
  if ((c.env.AUTH_MODE ?? "none") === "none") {
    return next();
  }
  return next();
};

const app = new Hono<AppEnv>();

// TODO(Phase B): POST /login per contract above.

export default app;
