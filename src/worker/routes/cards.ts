/**
 * Cards routes. Owned by Phase B.
 *
 * CONTRACT (paths are relative to /api):
 *   GET    /cards?includeClosed=1     → CardListItem[]
 *   POST   /cards        body CardInput → Card (201)
 *   GET    /cards/:id                 → CardDetailPayload
 *   PUT    /cards/:id    body CardInput → Card
 *   POST   /cards/:id/close           → Card (soft close)
 *   POST   /cards/:id/reopen          → Card
 *   POST   /cards/:id/benefits body BenefitInput → Benefit (201)
 *   POST   /cards/import body ImportPayload → { card: Card, benefits: Benefit[] } (201, atomic db.batch)
 * Errors: 404 {code:'not_found'}, 400 {code:'validation'} per ApiError.
 */
import { Hono } from "hono";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// TODO(Phase B): implement per contract above.

export default app;
