# Card Benefits Tracker

Personal PWA for tracking credit-card reward benefits: program benefits in
(plain English via Claude, or manually), check them off each cycle, comment on
how you used them, and get warnings before benefits — and annual-fee
anniversaries — expire.

**Stack:** Cloudflare Workers + D1 (SQLite) + Hono API · React + Vite PWA ·
`@cloudflare/vite-plugin` (one dev server for both) · Claude API
(`claude-opus-4-8`, structured outputs) for plain-English benefit parsing.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars          # put your real ANTHROPIC_API_KEY in it
npm run db:migrate:local                # apply migrations to local D1
npm run dev                             # http://localhost:5173 (worker + web + local D1)
```

- `npm test` — vitest suite for the cycle/dashboard math (the correctness core).
- `npm run check` — TypeScript.
- Mock mode (UI without a worker): `VITE_USE_MOCK=1 npm run dev`.
- Time travel: in dev only, API requests honor an `X-Debug-Today: YYYY-MM-DD`
  header so you can exercise expiration warnings and cycle rollovers.

## Architecture notes

- **Cycle windows are computed, never stored.** `src/shared/cycles.ts` derives
  each benefit's current/past windows from (frequency, anchor, card
  anniversary). Usage rows are created lazily, keyed `(benefit_id, cycle_key)`.
- **Automatic benefits**: `used` defaults to the benefit's `automatic` flag
  (`row.used ?? automatic`), so auto-posting credits are pre-checked each cycle
  but can be explicitly unchecked if a credit doesn't post.
- **Annual fees** are synthesized dashboard items from the card's anniversary —
  they surface in "expiring soon" within 30 days of renewal.
- `src/shared/dashboard.ts#computeDashboard` is pure over data snapshots — a
  future email digest is a Cron Trigger that loads the same data and calls the
  same function.
- SQL is portable SQLite in `src/worker/db.ts` (only D1-ism: `db.batch`), so
  moving to Railway/Node would be a driver + static-serving swap.

## Deploy (Cloudflare)

One-time setup:

```sh
npx wrangler login                          # or CLOUDFLARE_API_TOKEN env var
npx wrangler d1 create card_benefits        # copy the database_id it prints
#   -> paste that id into wrangler.jsonc "database_id"
npm run db:migrate:remote                   # apply migrations to remote D1
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key
```

Every deploy:

```sh
npm run deploy
```

### Push-to-deploy from GitHub (optional)

Cloudflare can deploy on every push to `main` (Workers Builds): dashboard →
**Workers & Pages → card-benefits → Settings → Build → Connect** → pick the
`jakewalker/card-benefits` repo. Build command `npm run build`, deploy command
`npx wrangler deploy -c dist/card_benefits/wrangler.json`.

> ⚠️ Auto-deploys do NOT run D1 migrations. Whenever a new file lands in
> `migrations/`, run `npm run db:migrate:remote` once by hand (before or right
> after the push — the schema change must exist before code that uses it).

### Auth: Cloudflare Access (recommended)

The app ships with `AUTH_MODE: "none"` and expects Cloudflare Access in front:

1. Zero Trust dashboard → **Access → Applications → Add an application → Self-hosted**.
2. Application domain: your `*.workers.dev` subdomain (or custom domain).
3. Policy: **Allow** · Include → **Emails** → your email. Session duration:
   1 month (longest available) keeps re-auth rare on the phone.
4. Login method: One-time PIN (email OTP) is the zero-setup option.

### Auth fallback: app password

If Access is annoying inside the iOS standalone PWA (cookie/session quirks):

```sh
npx wrangler secret put APP_PASSWORD
```

then set `"AUTH_MODE": "password"` in `wrangler.jsonc` and redeploy. The app
shows its own login screen and keeps a signed 180-day cookie. (If Access is
still enabled, remove the Access application — you don't want both prompting.)

### iPhone install

Open the deployed URL in Safari → Share → **Add to Home Screen**. The app runs
standalone with its own icon.
