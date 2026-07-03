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
 *
 * Implementation note: the cookie is signed with Hono's `hono/cookie`
 * getSignedCookie/setSignedCookie helpers, which sign via
 * crypto.subtle.sign/verify(HMAC, SHA-256) over a key imported from the raw
 * APP_PASSWORD bytes — i.e. exactly the WebCrypto HMAC-SHA-256 scheme the
 * contract describes, without hand-rolling cookie parsing. The cookie value
 * itself is the token's expiry (epoch ms), so `authMiddleware` re-validates
 * expiry server-side from the signed payload rather than trusting the
 * browser to honor Max-Age.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import type { ApiError } from "../shared/types";
import type { AppEnv } from "./index";

const COOKIE_NAME = "cb_session";
const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // ~180 days

function unauthorized(message: string): Response {
  return Response.json(
    { error: message, code: "unauthorized" } satisfies ApiError,
    { status: 401 },
  );
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const mode = c.env.AUTH_MODE ?? "none";
  if (mode === "none") {
    return next();
  }

  // Login itself must be reachable without a session cookie.
  if (new URL(c.req.url).pathname === "/api/login") {
    return next();
  }

  const secret = c.env.APP_PASSWORD;
  if (!secret) {
    // Misconfigured (password mode without a secret) — fail closed.
    return unauthorized("auth not configured");
  }

  const value = await getSignedCookie(c, secret, COOKIE_NAME);
  if (!value) {
    // Missing cookie, or signature verification failed (tampered/forged).
    return unauthorized("unauthorized");
  }

  const expiresAt = Number(value);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return unauthorized("session expired");
  }

  return next();
};

const loginBodySchema = z.object({ password: z.string().min(1) });

const app = new Hono<AppEnv>();

app.post("/login", async (c) => {
  const mode = c.env.AUTH_MODE ?? "none";
  if (mode !== "password") {
    return c.body(null, 204);
  }

  const secret = c.env.APP_PASSWORD;
  if (!secret) {
    return unauthorized("auth not configured");
  }

  const body = await c.req.json().catch(() => null);
  const parsed = loginBodySchema.safeParse(body);
  if (!parsed.success || parsed.data.password !== secret) {
    return unauthorized("invalid password");
  }

  const expiresAt = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000;
  await setSignedCookie(c, COOKIE_NAME, String(expiresAt), secret, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return c.body(null, 204);
});

export default app;
