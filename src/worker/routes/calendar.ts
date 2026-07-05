/**
 * Public, token-gated iCalendar feed of annual-fee renewals.
 *
 *   GET /calendar/:token/renewals.ics → text/calendar
 *
 * Lives OUTSIDE /api/* so the app's authMiddleware doesn't apply — this feed is
 * meant to be fetched anonymously by Google Calendar. Protection is the secret
 * :token (compared against env.CALENDAR_TOKEN). A bad/absent token returns 404
 * (not 401) so the endpoint's existence isn't confirmed to snoopers.
 *
 * NOTE: Cloudflare Access sits in front of this Worker, so this path also needs
 * a Zero Trust "Bypass" policy for /calendar/* or Access will 302 Google before
 * the request ever reaches here.
 */
import { Hono } from "hono";
import type { AppEnv } from "../index";
import { listCards } from "../db";
import { resolveToday } from "../today";
import { buildRenewalsIcs } from "../../shared/ics";

const app = new Hono<AppEnv>();

/** Length-independent equality to avoid leaking the token via timing. */
function tokenMatches(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

app.get("/calendar/:token/renewals.ics", async (c) => {
  const token = c.req.param("token");
  if (!tokenMatches(token, c.env.CALENDAR_TOKEN)) {
    // Explicit 404 (not c.notFound(), which falls through to the SPA asset
    // handler and would serve index.html for a bad token).
    return c.text("Not Found", 404);
  }

  const today = resolveToday(c);
  const now = new Date().toISOString();
  const cards = await listCards(c.env.DB, false); // active only
  const ics = buildRenewalsIcs(cards, today, now, {
    calName: "Card Renewals",
    domain: "cards.jakewalker.com",
  });

  return c.body(ics, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="renewals.ics"',
    "Cache-Control": "public, max-age=3600",
  });
});

export default app;
