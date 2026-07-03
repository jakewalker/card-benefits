/**
 * Auth middleware. Owned by Phase B.
 *
 * CONTRACT:
 * - AUTH_MODE unset or 'none' → passthrough (Cloudflare Access fronts the app).
 * - AUTH_MODE='password':
 *   - POST /api/login {password} (this route must stay UNguarded) compares
 *     against env.APP_PASSWORD; on success sets an HttpOnly, Secure,
 *     SameSite=Lax cookie holding an HMAC-signed token (WebCrypto, key
 *     derived from APP_PASSWORD), long-lived (180 days).
 *   - All other /api/* requests without a valid cookie → 401 {error, code:'unauthorized'}.
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./index";

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  // TODO(Phase B): implement per contract above.
  if ((c.env.AUTH_MODE ?? "none") === "none") {
    return next();
  }
  return next();
};
