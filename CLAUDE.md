# Card Benefits Tracker

Single-user PWA tracking credit-card reward benefits. Cloudflare Workers + D1 +
Hono + React/Vite via `@cloudflare/vite-plugin`. See README.md for setup/deploy.

## Commands

- `npm run dev` — worker + web + local D1 in one server
- `npm test` — vitest (cycle math; the correctness core — keep green)
- `npm run check` — tsc
- `npm run db:migrate:local` / `db:migrate:remote`
- `bash scripts/smoke.sh` — E2E API smoke against a dev server on :8788
  (`npx vite dev --port 8788`; expects a fresh or disposable local DB)

## Structure & rules

- `src/shared/types.ts` is the contract file (entities, DTOs, zod). Additive
  changes only; worker and web both import from it.
- `src/shared/{dates,cycles,dashboard}.ts` are PURE (no Date except
  `todayInAppTz`, no I/O). All cycle-window semantics live in their doc
  comments; any behavior change needs a test in `test/`.
- All SQL lives in `src/worker/db.ts` as portable SQLite strings (only D1-ism:
  `db.batch`). Routes validate with the shared zod schemas.
- `used` on a usage row is nullable: `null` = inherit `benefit.automatic`.
  Windows are `[start, end]` with inclusive end. Cycle keys: `2026-07`,
  `2026-Q3`, `2026-H2`, `2026`, or `A<start-date>` for anniversary anchors.
- Dev-only `X-Debug-Today: YYYY-MM-DD` header overrides "today" for testing.
- AI parse (`src/worker/ai.ts`): `claude-opus-4-8` with structured outputs;
  the JSON schema there must stay in lockstep with `parsedCardPayloadSchema`.
